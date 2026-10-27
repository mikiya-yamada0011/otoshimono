import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {SharePointRepository} from '../src/webparts/lostFoundStudent/found-items/api/repositories';
import {StudentService} from '../src/webparts/lostFoundStudent/found-items/api/service';
import {emptyCriteria,matches,matchesRequest,splitColors,studentIdFromEmail,today,validateCriteria,validateSchoolEmail} from '../src/webparts/lostFoundStudent/found-items/types/model';
import {DemoRepository,DEMO_STAFF,DEMO_STUDENT,seedDatabase,TEST_DATABASE_KEY} from './support/DemoRepository';
import {WorkflowService} from './support/WorkflowService';
import {directRequestKey,lostRecords} from '../src/webparts/lostFoundStudent/found-items/utils/lostRecords';
import { CAMPUSES } from '../src/webparts/lostFoundStudent/found-items/utils/locations';
const denied=new SharePointRepository({get:async()=>({ok:false,status:403})} as any,'https://example.invalid',DEMO_STUDENT);
const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v)}});
async function test():Promise<void>{
// The production photo reader expands attachments in one request, never reads
// authoritative inventory and never treats a daily batch as a claimable item.
const photoSite='https://example.invalid/teams/lost-found';
const photoRow={Id:7,PhotoCount:1,Title:'工学部事務室|2026-10-10|1',Slot:1,StorageWindow:'工学部事務室',ReceivedOn:'2026-10-10T00:00:00Z',AttachmentFiles:[
  {FileName:'photo.jpg',ServerRelativeUrl:'/teams/lost-found/Lists/LFDailyPhotoBatches/Attachments/7/photo.jpg'},
]};
const photoCalls:string[]=[];
const photoClient={get:async(url:string)=>{photoCalls.push(url);return {ok:true,status:200,text:async()=>JSON.stringify({value:[photoRow]})};}};
const photoRepo=new SharePointRepository(photoClient as any,photoSite,DEMO_STUDENT);
const photos=await new StudentService(photoRepo).loadDailyPhotoBatches();
assert.equal(photos.length,1);
assert.equal(photos[0].receivedOn,'2026-10-10');
assert.equal(photos[0].photos[0].url,photoSite+'/Lists/LFDailyPhotoBatches/Attachments/7/photo.jpg');
assert.equal(photoCalls.length,1);
assert(photoCalls[0].includes("getbytitle('LFDailyPhotoBatches')"));
assert(photoCalls[0].includes('$expand=AttachmentFiles'));
assert(!photoCalls[0].includes('FoundItems'));
const midnightRepo=new SharePointRepository({get:async()=>({ok:true,status:200,text:async()=>JSON.stringify({value:[{...photoRow,ReceivedOn:'2026-10-09T15:00:00Z'}]})})} as any,photoSite,DEMO_STUDENT);
assert.equal((await new StudentService(midnightRepo).loadDailyPhotoBatches())[0].receivedOn,'2026-10-10','Power Appsの日本時間0時を前日の受付日として表示しない');
await assert.rejects(()=>photoRepo.put('photoBatches',{}));
await assert.rejects(()=>photoRepo.remove('photoBatches','7'));
for(const raw of [
  {...photoRow,ReceivedOn:'2026-02-30'},
  {...photoRow,StorageWindow:''},
  {...photoRow,AttachmentFiles:undefined},
  {...photoRow,AttachmentFiles:[{FileName:'x.svg',ServerRelativeUrl:'/teams/lost-found/Lists/LFDailyPhotoBatches/Attachments/7/x.svg'}]},
  {...photoRow,AttachmentFiles:[{FileName:'x.jpg',ServerRelativeUrl:'https://outside.invalid/x.jpg'}]},
  {...photoRow,AttachmentFiles:[{FileName:'x.jpg',ServerRelativeUrl:'/teams/lost-found/Lists/LFDailyPhotoBatches/Attachments/8/x.jpg'}]},
  {...photoRow,AttachmentFiles:[{FileName:'x.jpg',ServerRelativeUrl:'/teams/lost-found/Lists/LFDailyPhotoBatches/Attachments/7/../../private.jpg'}]},
]) {
  const repo=new SharePointRepository({get:async()=>({ok:true,status:200,text:async()=>JSON.stringify({value:[raw]})})} as any,photoSite,DEMO_STUDENT);
  assert.equal((await repo.list('photoBatches'))[0].value.invalid,true);
  await assert.rejects(()=>new StudentService(repo).loadDailyPhotoBatches());
}
const noPhotoRepo=new SharePointRepository({get:async()=>({ok:true,status:200,text:async()=>JSON.stringify({value:[{...photoRow,AttachmentFiles:[]}]})})} as any,photoSite,DEMO_STUDENT);
assert.deepEqual(await new StudentService(noPhotoRepo).loadDailyPhotoBatches(),[]);
await assert.rejects(()=>new StudentService(denied).loadDailyPhotoBatches());
console.log('PASS: 日別写真の実API読込・一括添付取得・外部URL/別レコード/不正画像の拒否・学生書込禁止・未接続のエラー表示');
const campusFlow=JSON.parse(readFileSync('deployment/flows/PowerApps_新規登録時の条件照合.json','utf8'));
const syncFlow=JSON.parse(readFileSync('deployment/flows/PowerApps_即時公開同期.json','utf8'));
assert(!JSON.stringify(syncFlow).includes('PrivateCreate'),'手動照合からの通知を生成しない');
const mailFlow=JSON.stringify(JSON.parse(readFileSync('deployment/flows/メール送信.json','utf8')));
assert(mailFlow.includes('FINDER_') && mailFlow.includes('VALUABLE:'),'廃止した機能の送信待ちメールを除外する');
const matchActions=campusFlow.properties.definition.actions.NormalStored.actions.EachRequest.actions;
assert.equal(matchActions.RequestCampuses.inputs,"@if(empty(items('EachRequest')?['CampusCode']),json('[]'),split(items('EachRequest')?['CampusCode'],';'))");
assert.deepEqual(matchActions.UnmatchedWords.runAfter,{RequestCampuses:['Succeeded']});
assert.match(matchActions.Matches.expression,/or\(empty\(outputs\('RequestCampuses'\)\),contains\(outputs\('RequestCampuses'\),coalesce\(body\('Item'\)\?\['CampusCode'\],''\)\)\)/);
assert(!matchActions.Matches.expression.includes("equals(items('EachRequest')?['CampusCode'],body('Item')?['CampusCode'])"),'生成した本番フローに単一キャンパスの比較を残さない');
// Finder intake is retired at both the student service and repository boundary.
const retiredIntake=new StudentService(new DemoRepository({...DEMO_STUDENT}));
assert(!('submitFoundItem' in retiredIntake) && !('loadFoundSubmissions' in retiredIntake));
let intakeWrites=0;
const retiredRepo=new SharePointRepository({post:async()=>{intakeWrites++;throw new Error('must not write');}} as any,'https://example.invalid',DEMO_STUDENT);
await assert.rejects(()=>retiredRepo.put('submissions',{}),/保管窓口/);
assert.equal(intakeWrites,0);
let encodedRequest:Record<string,unknown>={};
const apiRequest=new SharePointRepository({
  post:async (_url:string,_configuration:unknown,options:{body:string})=>{encodedRequest=JSON.parse(options.body);return {ok:true,status:201,text:async()=>'{"Id":82}'};},
  get:async ()=>({ok:true,status:200,text:async()=>JSON.stringify({value:[{...encodedRequest,Id:82,AuthorId:DEMO_STUDENT.id,Author:{EMail:DEMO_STUDENT.email},Created:'2026-09-27T00:00:00Z'}]})})
} as any,'https://example.invalid',DEMO_STUDENT);
await apiRequest.put('requests',{key:directRequestKey('91'),email:DEMO_STUDENT.email,criteria:{...emptyCriteria(),parent:'P05'},feature:'',status:'ACTIVE',createdAt:'2026-09-27T00:00:00Z'});
assert.equal(encodedRequest.Title,directRequestKey('91'),'実APIでも再試行用の識別子を既存Title列に保存する');
assert.equal((await apiRequest.list('requests'))[0].value.key,directRequestKey('91'),'実APIの読込で識別子を保持する');
assert.equal(encodedRequest.LostFrom,null);assert.equal(encodedRequest.CampusCode,'');
await apiRequest.put('requests',{key:directRequestKey('91'),criteria:{...emptyCriteria(),parent:'P05',campuses:['C01','C02']},feature:'',status:'ACTIVE',createdAt:'2026-09-27T00:00:00Z'});
assert.equal(encodedRequest.CampusCode,'C01;C02','複数キャンパスは既存の文字列列へ区切って保存する');
assert.deepEqual(((await apiRequest.list('requests'))[0].value.criteria as any).campuses,['C01','C02']);
for(const [stored,expected] of [['C02',['C02']],['',[]],[null,[]],['C01;C02',['C01','C02']],[' C01 ; C02 ; C01 ',['C01','C02']]] as const) {
  const reader=new SharePointRepository({get:async()=>({ok:true,status:200,text:async()=>JSON.stringify({value:[{...encodedRequest,CampusCode:stored,Id:82,AuthorId:DEMO_STUDENT.id,Created:'2026-09-27T00:00:00Z'}]})})} as any,'https://example.invalid',DEMO_STUDENT);
  const row=(await reader.list('requests'))[0];
  assert.notEqual(row.value.invalid,true);
  assert.deepEqual((row.value.criteria as any).campuses,expected,'既存の単一・空欄・複数値を同じ配列へ復元する');
}
for(const malformed of ['C99','C01;C99',42,['C01']]) {
  const reader=new SharePointRepository({get:async()=>({ok:true,status:200,text:async()=>JSON.stringify({value:[{...encodedRequest,CampusCode:malformed,Id:82,AuthorId:DEMO_STUDENT.id,Created:'2026-09-27T00:00:00Z'}]})})} as any,'https://example.invalid',DEMO_STUDENT);
  assert.equal((await reader.list('requests'))[0].value.invalid,true,'不正な保存値を全キャンパスへ緩めない');
}
for(const campuses of [['C99'],['C01','C01'],['C01',42]]) {
  assert.throws(()=>validateCriteria({...emptyCriteria(),campuses:campuses as string[]}),/キャンパス/);
  await assert.rejects(()=>apiRequest.put('requests',{criteria:{...emptyCriteria(),campuses},feature:'',status:'ACTIVE',createdAt:'2026-09-27T00:00:00Z'}),/不正/);
}
assert.deepEqual(await denied.list('notices'),[],'最初の通知を受け取る前でも学生画面を開ける');
await assert.rejects(()=>denied.list('public'),'公開一覧の権限エラーは隠さない');
for(const status of [403,404,500]) {
  const partialRepo=new DemoRepository({...DEMO_STUDENT});
  const list=partialRepo.list.bind(partialRepo);
  let submissionReads=0;
  partialRepo.list=async table=>{
    if(table==='submissions'){submissionReads++;throw Object.assign(new Error(`LFFoundSubmissions: HTTP ${status}`),{status});}
    return list(table);
  };
  const partialService=new StudentService(partialRepo);
  assert.equal((await partialService.load()).items.length,4,'届け出の未設定・権限エラーでも公開検索は読み込める');
  assert.equal(submissionReads,0,'通常起動では届け出のリストを読まない');
}
await assert.rejects(()=>new StudentService(denied).load(),/LFPublicItems/,'公開一覧そのものの権限不足はエラーとして扱う');
const student=new StudentService(new DemoRepository({...DEMO_STUDENT}));
const readTables:string[]=[]; const previewRepo=new DemoRepository({...DEMO_STUDENT,role:'staff'}); const read=previewRepo.list.bind(previewRepo);
previewRepo.list=async table=>{readTables.push(table);return read(table);};
await new StudentService(previewRepo).load();
assert(!readTables.includes('items') && !readTables.includes('mail'),'学生サービスは職員アカウントでも非公開リストを読まない');
assert(!('returnItem' in student) && !('saveItem' in student),'学生サービスには職員の更新操作を含めない');
const staff=new WorkflowService(new DemoRepository({...DEMO_STAFF}));
let data=await student.load();assert(!data.items.some(i=>i.valuable));assert.equal(data.items.length,4);
const umbrella=data.items.find(i=>i.id==='1')!;
assert(matches(umbrella,{...emptyCriteria(),colors:['白','青']}));assert(!matches(umbrella,{...emptyCriteria(),colors:['青']}));assert.deepEqual(splitColors('黒;白、黒'),['黒','白']);
assert(matches(umbrella,{...emptyCriteria(),campuses:['C01','C02'],colors:['白','青']}));
assert(!matches(umbrella,{...emptyCriteria(),campuses:['C01','C03'],colors:['白','青']}));
assert(!matches(umbrella,{...emptyCriteria(),campuses:['C01','C02'],colors:['赤']}),'キャンパスORと色ORはANDで組み合わせる');
assert(!matches(umbrella,{...emptyCriteria(),campuses:['C01','C02'],parent:'P01'}),'種類など他の条件を緩めない');
assert(matchesRequest({...umbrella,feature:'青い ABC シール'},{id:'query-test',owner:'x',email:DEMO_STUDENT.email,criteria:{...emptyCriteria(),parent:'P05',query:'ABC　シール'},feature:'',valuable:false,status:'ACTIVE',createdAt:''}));
assert(!matchesRequest({...umbrella,feature:'無地'},{id:'query-test',owner:'x',email:DEMO_STUDENT.email,criteria:{...emptyCriteria(),parent:'P05',query:'ABC シール'},feature:'',valuable:false,status:'ACTIVE',createdAt:''}));
assert.throws(()=>validateSchoolEmail('x@evil.example',['stu.kobe-u.ac.jp']));
assert.equal(studentIdFromEmail('S260001@stu.kobe-u.ac.jp'),'s260001');
await student.saveRequest({...emptyCriteria(),parent:'P05',colors:['白']},'左に傷');
await staff.reconcile();assert.equal((await student.load()).notices.length,0,'条件保存時・再同期時に遡及照合しない');
await new Promise(r=>setTimeout(r,5));
await assert.rejects(()=>staff.saveItem({parent:'P05',category:'',title:'傘',colors:[],campus:'C02',building:'',place:'',foundOn:today(),window:'農学部事務室',feature:'',valuable:false}),/細かい種類/);
await assert.rejects(()=>staff.saveItem({parent:'P05',category:'P05_UMBRELLA_LONG',title:'傘',colors:[],campus:'',building:'',place:'',foundOn:today(),window:'農学部事務室',feature:'',valuable:false}),/拾得キャンパス/);
await staff.saveItem({parent:'P05',category:'P05_UMBRELLA_LONG',title:'長傘',colors:['白','黒'],campus:'C02',building:'',place:'農学部',foundOn:today(),window:'農学部事務室',feature:'木の持ち手',valuable:false});
data=await student.load();assert.equal(data.notices.length,1);const notice=data.notices[0];
assert.equal(data.claims.length,0,'候補通知だけでは受取申出を作らない');
assert.equal(data.requests[0].status,'ACTIVE','候補通知だけでは申告を解決しない');
assert.equal(lostRecords(data)[0].status,'候補あり');
const multipleCandidates=lostRecords({...data,notices:[
  {...notice,id:'1'},
  {...notice,id:'2'},
  {...notice,id:'3',itemId:'2'},
  {...notice,id:'4',itemId:'expired'},
  {...notice,id:'5',itemId:'4',kind:'VALUABLE',title:'非公開の品名',message:'非公開の特徴'},
  {...notice,id:'6',itemId:'3',requestId:'unrelated'}
]})[0];
assert.equal(multipleCandidates.candidates.length,2,'通知の重複・公開候補の終了・別の申告・廃止した手動案内を除いて集める');
assert(!multipleCandidates.candidates.some(candidate=>candidate.item.id==='4'),'廃止した非公開候補を生成しない');
assert(!JSON.stringify(multipleCandidates.candidates).includes('非公開の品名'));
await staff.reconcile();assert.equal((await student.load()).notices.length,1,'通知は重複しない');
await student.createClaim(notice.itemId,'',notice.requestId);data=await student.load();const claim=data.claims[0];assert.equal(claim.feature,'左に傷');
assert.equal(claim.requestId,notice.requestId,'承諾時に通知元の申告だけを紐づける');
await assert.rejects(()=>student.createClaim(notice.itemId,'',notice.requestId),/すでに申し出/);
assert.equal(lostRecords(data).filter(record=>record.status==='受け取り予定').length,1);
await student.cancelClaim(claim.id);
assert.equal((await student.load()).requests.find(request=>request.id===notice.requestId)?.status,'ACTIVE','受取申出の取り下げ後も紛失申告は継続する');
await student.createClaim(notice.itemId,'',notice.requestId);
// Continue the existing return checks using the newly accepted claim.
Object.assign(claim,(await student.load()).claims.find(candidate=>candidate.itemId===notice.itemId && candidate.status==='PENDING'));
await assert.rejects(()=>staff.returnItem(notice.itemId,claim.email,claim.id,false));
for(const window of ['工学部事務室','']) {
  await staff.saveProfile({email:DEMO_STAFF.email,window});
  await assert.rejects(()=>staff.returnItem(notice.itemId,claim.email,claim.id,true),/所属窓口/);
  await assert.rejects(()=>staff.returnItem('1',DEMO_STUDENT.email,'',true),/所属窓口/);
  assert.equal((await staff.load()).items.find(i=>i.id===notice.itemId)!.status,'保管中');
}
await staff.saveProfile({email:DEMO_STAFF.email,window:'農学部事務室'});
await staff.saveItem({parent:'P01',category:'P01_WALLET',title:'財布',colors:['茶'],campus:'C02',building:'',place:'農学部',foundOn:today(),window:'農学部事務室',feature:'職員判断で公開',valuable:false});
assert((await student.load()).items.some(i=>i.parent==='P01'&&i.feature==='職員判断で公開'),'種類が財布でも職員が公開を選べる');
const mailBeforeReturn=(await staff.load()).mail.length;
await staff.returnItem(notice.itemId,claim.email,claim.id,true);
await assert.rejects(()=>staff.returnItem(notice.itemId,claim.email,claim.id,true),'二重返却を拒否');
data=await student.load();assert(!data.items.some(i=>i.id===notice.itemId));assert(!data.notices.some(n=>!['MATCH','VALUABLE'].includes(n.kind)));assert.equal(data.claims.find(c=>c.id===claim.id)?.status,'RETURNED');assert.equal(data.requests[0].status,'RESOLVED');assert.equal((await staff.load()).mail.length,mailBeforeReturn,'返却時は通知・メールを作らない');
await student.saveRequest({...emptyCriteria(),parent:'P01',category:'P01_WALLET'},'右下に傷');
assert(!('notify' in staff),'手動照合の操作を持たない');
assert(!(await staff.load()).items.some(item=>item.id==='4'),'旧非公開品は職員画面にも表示しない');
await assert.rejects(()=>student.createClaim('4',''),/現在申し出できません/);
const stranger=new WorkflowService(new DemoRepository({...DEMO_STUDENT,id:'student-2',email:'s260002@stu.kobe-u.ac.jp'}));
assert.equal((await stranger.load()).notices.length,0);assert.equal((await stranger.load()).claims.length,0);
await assert.rejects(()=>stranger.createClaim('4',''));
await assert.rejects(()=>new WorkflowService(new DemoRepository({...DEMO_STUDENT})).returnItem('1',DEMO_STUDENT.email,'',true));
// 事前申出なしの返却は現物の履歴だけを更新し、学生通知は作らない。
await staff.returnItem('1',DEMO_STUDENT.email,'',true);
assert(!(await student.load()).notices.some(n=>n.itemId==='1'));
await assert.rejects(()=>staff.correctReturn('1',''));
await staff.correctReturn('1','引き渡し前に対象違いに気付いた');
assert((await student.load()).items.some(i=>i.id==='1'));
assert.equal((await staff.load()).items.find(i=>i.id==='1')!.audit!.length,1);
await staff.returnItem('2',DEMO_STUDENT.email,'',true);
assert.equal((await staff.load()).items.find(i=>i.id==='3')!.status,'保管中','他の品物は返却しない');
await assert.rejects(()=>staff.returnItem('3','student456@stu.kobe-u.ac.jp','',false),/本人確認/);
await staff.returnItem('3','student456@stu.kobe-u.ac.jp','',true);
assert((await staff.load()).items.filter(i=>['2','3'].includes(i.id)&&i.status==='返却済み').length===2,'品物ごとに本人確認して別の相手へ返却できる');
assert.equal((await staff.load()).items.find(i=>i.id==='3')!.recipientEmail,'student456@stu.kobe-u.ac.jp');
await staff.saveItem({parent:'P06',category:'P06_PENCIL_CASE',title:'ペンケース',colors:['赤'],campus:'C02',building:'',place:'',foundOn:today(),window:'農学部事務室',feature:'移管試験A',valuable:false});
await staff.saveItem({parent:'P07',category:'P07_BOTTLE',title:'水筒',colors:['青'],campus:'C02',building:'',place:'',foundOn:today(),window:'農学部事務室',feature:'移管試験B',valuable:false});
const transfers=(await staff.load()).items.filter(item=>item.feature.startsWith('移管試験'));
await assert.rejects(()=>staff.transferItems(transfers.map(item=>item.id),'守衛室',false),/確認/);
await staff.transferItems(transfers.map(item=>item.id),'守衛室',true);
assert((await staff.load()).items.filter(item=>transfers.some(target=>target.id===item.id)&&item.status==='移管済み'&&item.internalNote?.includes('移管先：守衛室')).length===2,'複数品を同じ移管先へ移管し監査情報を残す');
const original=staff.repo.put.bind(staff.repo);let fail=true;
staff.repo.put=async(table,value,id,etag)=>{if(table==='public'&&fail){fail=false;throw new Error('network');}return original(table,value,id,etag);};
await assert.rejects(()=>staff.saveItem({parent:'P06',category:'P06_PENCIL_CASE',title:'ペンケース',colors:['黒'],campus:'C02',building:'',place:'',foundOn:today(),window:'農学部事務室',feature:'',valuable:false}),/保存は完了/);
const count=(await staff.load()).items.length;await staff.reconcile();assert.equal((await staff.load()).items.length,count);
const newestId=(await staff.repo.list('items')).at(-1)!.id;
assert((await student.load()).items.some(i=>i.id===newestId));
const stale=(await staff.load()).items.find(i=>i.id==='1')!;await staff.repo.put('items',{...stale,feature:'updated'},stale.id,stale.etag);
await assert.rejects(()=>staff.repo.put('items',stale,stale.id,stale.etag));
// Historical finder metadata does not produce a thank-you when returned.
await staff.saveItem({parent:'P01',category:'P01_WALLET',title:'財布',colors:['茶'],campus:'C02',building:'',place:'窓口',foundOn:today(),window:'農学部事務室',feature:'旧拾得者データ検証',valuable:false});
const oldFinderItem=(await staff.load()).items.find(item=>item.feature==='旧拾得者データ検証')!;
const sourceFinder=(await staff.repo.list('items')).find(row=>row.id===oldFinderItem.id)!;
await staff.repo.put('items',{...sourceFinder.value,finderEmail:DEMO_STUDENT.email,studentSubmissionKey:'legacy'},sourceFinder.id,sourceFinder.etag);
await staff.returnItem(sourceFinder.id,'s260002@stu.kobe-u.ac.jp','',true);
assert(!(await staff.repo.list('mail')).some(row=>String(row.value.key).startsWith('FINDER_')));
// A direct entry creates a loss record without asking the student to repeat
// information. It must not guess which unrelated existing report to reuse.
storage.clear();
const unifiedRepo=new DemoRepository({...DEMO_STUDENT});
const unified=new StudentService(unifiedRepo);
const unifiedStaff=new WorkflowService(new DemoRepository({...DEMO_STAFF}));
await unified.saveRequest({...emptyCriteria(),parent:'P05'},'別の傘');
assert.equal(lostRecords(await unified.load())[0].status,'探し中');
await unified.createClaim('1',' 木の持ち手 ');
let unifiedData=await unified.load();
const direct=unifiedData.claims[0];
const directRequest=unifiedData.requests.find(request=>request.id===direct.requestId)!;
assert.equal(unifiedData.requests.length,2,'類似する既存申告とは勝手に統合しない');
assert.equal(directRequest.key,directRequestKey(direct.id));
assert.deepEqual(directRequest.criteria,{...emptyCriteria(),parent:'P05',category:'P05_UMBRELLA_LONG',colors:['黒','白']});
assert.equal(directRequest.feature,'木の持ち手');
assert.equal(lostRecords(unifiedData).filter(record=>record.status==='受け取り予定').length,1);
await assert.rejects(()=>unified.createClaim('1',''),/すでに申し出/);
await assert.rejects(()=>unified.createClaim('2','x'.repeat(1001)),/1000/);
await unified.cancelClaim(direct.id);
unifiedData=await unified.load();
assert.equal(unifiedData.requests.find(request=>request.id===directRequest.id)?.status,'ACTIVE');
assert.equal(lostRecords(unifiedData).find(record=>record.request?.id===directRequest.id)?.status,'候補あり');
assert.equal(lostRecords(unifiedData).find(record=>record.request?.id===directRequest.id)?.candidates.length,1,'直接申し込みの取消後は通知がなくても候補を表示する');
assert.equal(lostRecords({...unifiedData,notices:[{id:'deduplicated',owner:DEMO_STUDENT.id,email:DEMO_STUDENT.email,itemId:direct.itemId,requestId:directRequest.id,claimId:'',title:'候補',window:'農学部事務室',message:'',kind:'MATCH',createdAt:directRequest.createdAt}]}).find(record=>record.request?.id===directRequest.id)?.candidates.length,1,'直接候補と通知も同じ品物なら一つにする');
assert.equal(lostRecords({...unifiedData,items:unifiedData.items.filter(item=>item.id!==direct.itemId)}).find(record=>record.request?.id===directRequest.id)?.status,'探し中','申し込み取消後、候補がなくなっていれば探し中');
await unified.createClaim('1','',directRequest.id);
unifiedData=await unified.load();
assert.equal(unifiedData.requests.length,2,'候補からの再申し込みで同じ記録を維持する');
const accepted=unifiedData.claims.find(claim=>claim.status==='PENDING')!;
const otherRequest=unifiedData.requests.find(request=>request.id!==directRequest.id)!;
await unified.cancelRequest(otherRequest.id);
await unifiedStaff.saveItem({parent:'P05',category:'P05_UMBRELLA_LONG',title:'長傘',colors:['白'],campus:'C02',building:'',place:'',foundOn:today(),window:'農学部事務室',feature:'',valuable:false});
assert.equal((await unified.load()).notices.length,0,'受け取り予定の物に別の候補通知を送らない');
await unifiedStaff.returnItem('1',accepted.email,accepted.id,true);
unifiedData=await unified.load();
assert.equal(lostRecords(unifiedData).length,1);
assert.equal(lostRecords(unifiedData)[0].status,'受け取り済み');
assert.equal(unifiedData.requests.find(request=>request.id===directRequest.id)?.status,'RESOLVED');
await unifiedStaff.correctReturn('1','誤操作の訂正');
assert.equal(lostRecords(await unified.load())[0].status,'受け取り予定');
await unified.cancelRequest(directRequest.id);
assert.equal(lostRecords(await unified.load()).length,0,'一度の取り下げで申告と申出の両方を終了する');
assert(!(await unified.load()).claims.some(claim=>claim.status==='PENDING'));

// Simulate interruptions before/after a write, and restart the service before
// retrying. Stable persisted identity, not local form state, prevents duplicates.
for(const failure of ['request-before','request-after','link-before','link-after','claim-after']) {
  storage.clear();
  const repo=new DemoRepository({...DEMO_STUDENT});
  const put=repo.put.bind(repo);
  let fail=true;
  repo.put=async (table,value,id,etag)=>{
    const target=failure.startsWith('request')?table==='requests' && !id:
      failure.startsWith('link')?table==='claims' && !!id:table==='claims' && !id;
    if(fail && target) {
      fail=false;
      if(failure.endsWith('after')) await put(table,value,id,etag);
      throw new Error('test connection interruption');
    }
    return put(table,value,id,etag);
  };
  if(failure==='link-after') await new StudentService(repo).createClaim('1','持ち手の傷');
  else await assert.rejects(()=>new StudentService(repo).createClaim('1','持ち手の傷'));
  const partial=await new StudentService(repo).load();
  assert.equal(lostRecords(partial).length,1,`${failure}: 途中状態でもカードを二重表示しない`);
  const alreadyLinked=partial.claims[0].requestId;
  if(!alreadyLinked) await new StudentService(repo).createClaim('1','持ち手の傷');
  else await assert.rejects(()=>new StudentService(repo).createClaim('1',''),/すでに申し出/);
  const recovered=await new StudentService(repo).load();
  assert.equal(recovered.claims.length,1,`${failure}: 申出を二重作成しない`);
  assert.equal(recovered.requests.length,1,`${failure}: 申告を二重作成しない`);
  assert.equal(recovered.claims[0].requestId,recovered.requests[0].id);
  assert.equal(lostRecords(recovered).length,1);
}
// Competing applications are not competing returns. Ending an unavailable
// application must never resolve the other student's loss report or change Author.
for(const route of ['public','walkin','interrupted']) {
  storage.clear();
  const first=new StudentService(new DemoRepository({...DEMO_STUDENT}));
  const secondUser={...DEMO_STUDENT,id:'student-2',email:'s260002@stu.kobe-u.ac.jp'};
  const second=new StudentService(new DemoRepository(secondUser));
  const counter=new WorkflowService(new DemoRepository({...DEMO_STAFF}));
  const itemId='1';
  for(const service of [first,second]) {
    await service.createClaim(itemId,'自分が覚えている特徴');
  }
  const winner=(await first.load()).claims[0];
  const loser=(await second.load()).claims[0];
  const mailCount=(await counter.load()).mail.length;
  if(route==='interrupted') {
    const put=counter.repo.put.bind(counter.repo);
    let fail=true;
    counter.repo.put=async(table,value,id,etag)=>{
      if(fail && table==='claims' && id===loser.id){fail=false;throw new Error('終了処理中の切断');}
      return put(table,value,id,etag);
    };
    await assert.rejects(()=>counter.returnItem(itemId,winner.email,winner.id,true),/再同期/);
    assert.equal((await counter.load()).items.find(item=>item.id===itemId)?.status,'返却済み');
    await counter.reconcile();
  } else await counter.returnItem(itemId,winner.email,route==='walkin'?'':winner.id,true);
  const afterFirst=await first.load();
  const afterSecond=await second.load();
  assert.equal(afterSecond.claims[0].status,'UNAVAILABLE',route);
  assert.equal(afterSecond.claims[0].owner,secondUser.id,'職員が更新しても元の登録者を保持する');
  assert.equal(afterSecond.requests[0].status,'ACTIVE','ほかの学生の申告は解決済みにしない');
  assert.equal(lostRecords(afterSecond)[0].status,'探し中','終了した申出と古い非公開通知は受け取り予定・候補ありにしない');
  await assert.rejects(()=>second.createClaim(itemId,'',loser.requestId),/現在申し出できません/);
  assert(!(await counter.load()).claims.some(claim=>claim.itemId===itemId && claim.status==='PENDING'));
  await counter.reconcile();
  assert.equal((await counter.load()).mail.length,mailCount,'ほかの申出の終了で返却メールを送らない');
  if(route==='walkin') {
    assert.equal(afterFirst.claims[0].status,'UNAVAILABLE','申出なし返却では全申出を終了する');
    assert.equal(afterFirst.requests[0].status,'ACTIVE');
  } else {
    assert.equal(afterFirst.claims[0].status,'RETURNED');
    assert.equal(afterFirst.requests[0].status,'RESOLVED');
    await counter.correctReturn(itemId,'引き渡す前に対象違いと判明');
    assert.equal((await first.load()).claims[0].status,'PENDING','訂正時に返却相手の申出だけ再開する');
    assert.equal((await second.load()).claims[0].status,'UNAVAILABLE','ほかの学生の申出は勝手に再開しない');
    await second.createClaim(itemId,'',loser.requestId);
  }
}
const unavailableReader=new SharePointRepository({get:async()=>({ok:true,status:200,text:async()=>JSON.stringify({value:[{Id:99,AuthorId:DEMO_STUDENT.id,Author:{EMail:DEMO_STUDENT.email},ItemId:'1',RequestId:'1',ItemTitle:'長傘',StorageWindow:'農学部事務室',ClaimStatus:'UNAVAILABLE',Created:'2026-09-27T00:00:00Z'}]})})} as any,'https://example.invalid',DEMO_STUDENT);
assert.equal((await unavailableReader.list('claims'))[0].value.status,'UNAVAILABLE','本番のAPIでも新しい終了状態を読み取る');
assert.notEqual((await unavailableReader.list('claims'))[0].value.invalid,true);
storage.clear();
const campusSeed=seedDatabase();
for(const table of ['items','public'] as const) for(const row of campusSeed[table]) row.value.createdAt='2000-01-01T00:00:00Z';
localStorage.setItem(TEST_DATABASE_KEY,JSON.stringify(campusSeed));
const campusStudent=new StudentService(new DemoRepository({...DEMO_STUDENT}));
const campusCounter=new WorkflowService(new DemoRepository({...DEMO_STAFF}));
await campusStudent.saveRequest({...emptyCriteria(),parent:'P05',category:'P05_UMBRELLA_LONG',campuses:['C01','C02'],colors:['白','赤']},'キャンパス通知検証');
const campusRequest=(await campusStudent.load()).requests[0];
const campusItem={parent:'P05',category:'P05_UMBRELLA_LONG',title:'長傘',colors:['白'],campus:'C01',building:'',place:'',foundOn:today(),window:'農学部事務室',feature:'',valuable:false};
for(const [campus,colors,valuable] of [['C01',['白'],false],['C02',['赤'],false],['C03',['白'],false],['C01',['青'],false]] as const) {
  await campusCounter.saveItem({...campusItem,campus,colors:[...colors],valuable});
}
assert.equal((await campusStudent.load()).notices.length,2,'選択したどちらのキャンパスにも一致するが、未選択・色不一致・非公開には自動通知しない');
await campusCounter.reconcile();
assert.equal((await campusStudent.load()).notices.length,2,'再同期で重複通知しない');
await campusStudent.saveRequest({...campusRequest.criteria,campuses:[]},campusRequest.feature,campusRequest.id);
await campusCounter.saveItem({...campusItem,campus:'C03',feature:'すべて選択後の新規対象'});
const allCampusItem=(await campusCounter.load()).items.find(item=>item.feature==='すべて選択後の新規対象')!;
assert.equal((await campusStudent.load()).notices.filter(notice=>notice.itemId===allCampusItem.id).length,1,'すべてに変更した申告は別キャンパスの新規登録も対象にする');
console.log('PASS: キャンパス複数OR・色などとのAND・実APIの保存復元・旧単一値・無効値拒否・通知対象と重複防止');
console.log('PASS: 同一品への複数申出・候補の終了・申出なし返却・途中失敗の再同期・返却訂正・本人申告の継続');
console.log('PASS: 統一状態・直接登録・通知承諾・再申し込み・返却訂正・一括取り下げ・中断再試行5パターン');
console.log('PASS: 複数色OR、登録イベント照合、通知重複防止、申出引継ぎ、本人確認、単件返却、一括移管、二重返却防止、解決状態、利用者隔離');
console.log('PASS: 拾得者登録の廃止・旧非公開品の除外・手動照合の廃止・お礼メールを生成しない');
}
test().catch(e=>{console.error(e);process.exitCode=1;});
