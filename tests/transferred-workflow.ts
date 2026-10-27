import assert from 'node:assert/strict';
import {StudentService} from '../src/webparts/lostFoundStudent/found-items/api/service';
import {SharePointRepository} from '../src/webparts/lostFoundStudent/found-items/api/repositories';
import {lostRecords} from '../src/webparts/lostFoundStudent/found-items/utils/lostRecords';
import {seedDatabase,DemoRepository,DEMO_STUDENT,TEST_DATABASE_KEY} from './support/DemoRepository';
const store=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>store.get(key)||null,setItem:(key:string,value:string)=>store.set(key,value)}});
async function test():Promise<void> {
 const db=seedDatabase();
 const transferred=db.public.find(row=>row.value.sourceId==='1')!;
 transferred.value={...transferred.value,status:'移管済み',transferredAt:'2026/10/27',transferDestination:'灘警察署'};
 db.requests=[{id:'80',author:DEMO_STUDENT.id,etag:'1',value:{criteria:{parent:'P05',category:'P05_UMBRELLA_LONG',colors:[],campuses:[],building:'',dateFrom:'',dateTo:'',query:''},feature:'確認',status:'ACTIVE',createdAt:'2026-10-26T00:00:00Z'}}];
 db.claims=[{id:'80',author:DEMO_STUDENT.id,etag:'1',value:{itemId:'1',requestId:'80',email:DEMO_STUDENT.email,feature:'確認',title:'長傘',window:'窓口',status:'PENDING',createdAt:'2026-10-26T00:00:00Z',returnedAt:''}}];
 db.notices=[{id:'80',author:'staff-1',etag:'1',value:{owner:DEMO_STUDENT.id,email:DEMO_STUDENT.email,itemId:'2',requestId:'80',kind:'MATCH',title:'別の候補',window:'窓口',createdAt:'2026-10-27T00:00:00Z'}}];
 store.set(TEST_DATABASE_KEY,JSON.stringify(db));
 const service=new StudentService(new DemoRepository(DEMO_STUDENT));
 const data=await service.load();
 assert.equal(data.items.find(item=>item.id==='1')!.transferDestination,'灘警察署');
 assert.equal(lostRecords(data)[0].status,'警察へ移管済み');
 assert.equal(data.requests[0].status,'ACTIVE');
 await assert.rejects(()=>service.createClaim('1','確認','80'),/現在申し出できません/);
 assert.equal((await service.load()).claims.length,1);
 await service.createClaim('2','確認','80');
 assert.equal(lostRecords(await service.load())[0].status,'受け取り予定');
 for(const status of ['UNAVAILABLE','CANCELLED'] as const) {
  const snapshot={...data,claims:data.claims.map(claim=>({...claim,status}))};
  assert.equal(lostRecords(snapshot)[0].status,status==='UNAVAILABLE'?'警察へ移管済み':'候補あり');
 }
 const urls:string[]=[];
 const client={get:async(url:string)=>{urls.push(url);return {ok:true,status:200,text:async()=>JSON.stringify({value:[{Id:1,SourceItemId:'1',ItemStatus:'移管済み',TransferredAt:'2026/10/27',TransferDestination:'灘警察署',ItemTitle:'鍵',ParentCategoryCode:'P10',CategoryCode:'P10_KEY',Created:'2026-10-20T00:00:00Z'}]})};}};
 const rows=await new SharePointRepository(client as any,'https://example.invalid',DEMO_STUDENT).list('public');
 assert.equal(rows[0].value.transferDestination,'灘警察署');
 assert(urls[0].includes("ItemStatus eq '移管済み'"));
 assert(urls[0].includes('TransferredAt,TransferDestination'));
 assert(!urls[0].includes("getbytitle('FoundItems')"));
 // Missing optional columns must not turn the entire student screen into HTTP 400.
 const oldSchemaCalls:string[]=[];
 const legacyClient={get:async(url:string)=>{
  oldSchemaCalls.push(url);
  return url.includes('TransferredAt') ? {ok:false,status:400,text:async()=>JSON.stringify({'odata.error':{message:{value:"フィールドまたはプロパティ 'TransferredAt' が存在しません。"}}})}
   : {ok:true,status:200,text:async()=>JSON.stringify({value:[{Id:1,SourceItemId:'1',ItemStatus:'保管中',ItemTitle:'鍵',Created:'2026-10-20T00:00:00Z'}]})};
 }};
 const legacyRepo=new SharePointRepository(legacyClient as any,'https://example.invalid',DEMO_STUDENT);
 const legacyRows=await legacyRepo.list('public');
 assert.equal(legacyRows.length,1);
 assert.equal(legacyRows[0].value.transferredAt,'');
 assert.equal(oldSchemaCalls.length,2);
 assert(!oldSchemaCalls[1].includes('TransferredAt'));
 assert(!oldSchemaCalls[1].includes('TransferDestination'));
 assert(oldSchemaCalls[1].includes("ItemStatus eq '移管済み'"));
 await legacyRepo.list('public');
 assert.equal(oldSchemaCalls.length,3,'同じインスタンスでは毎回失敗する照会を繰り返さない');
 for(const message of ["The field or property 'TransferDestination' does not exist.","フィールドまたはプロパティ 'TransferDestination' が存在しません。"]) {
  let calls=0;
  const repo=new SharePointRepository({get:async(url:string)=>{calls++;return url.includes('TransferredAt') ? {ok:false,status:400,text:async()=>JSON.stringify({error:{message}})} : {ok:true,status:200,text:async()=>JSON.stringify({value:[]})};}} as any,'https://example.invalid',DEMO_STUDENT);
  assert.deepEqual(await repo.list('public'),[]);assert.equal(calls,2);
 }
 for(const status of [400,403,404,500]) {
  let calls=0;
  const repo=new SharePointRepository({get:async()=>{calls++;return {ok:false,status,text:async()=>JSON.stringify({error:{message:'Invalid query or access denied'}})};}} as any,'https://example.invalid',DEMO_STUDENT);
  await assert.rejects(()=>repo.list('public'));assert.equal(calls,1,'他のエラーを握りつぶさない');
 }
 console.log('PASS: 移管列未追加の400だけ1回再試行・旧列で表示・不要な再試行/他エラーの隠蔽なし');
 console.log('PASS: 移管API読込・申込拒否・対応中維持・別候補の申込・取消/終了の区別');
}
void test();
