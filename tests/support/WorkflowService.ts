import { AppService, Snapshot, Profile, Item, ItemInput, Request, Claim, Notice, Mail, Criteria, categoryName, matchesRequest, publicItem, validateCriteria, validateSchoolEmail, today } from '../../src/webparts/lostFoundStudent/found-items/types/model';
import { Repository, Row, Table } from '../../src/webparts/lostFoundStudent/found-items/api/service';
import { StudentService } from '../../src/webparts/lostFoundStudent/found-items/api/service';
import { FoundSubmission, FoundSubmissionInput } from '../../src/webparts/lostFoundStudent/found-items/types/model';
export interface AdminRepository extends Repository {
  grantNotice(id: string, owner: string): Promise<void>;
}
export interface NotificationHistoryRow {
 id:string;itemId:string;title:string;studentId:string;window:string;status:string;sentAt:string;error:string;
}
export interface AdminSnapshot extends Snapshot {
 notificationHistory:NotificationHistoryRow[];
}
export interface AdminAppService extends AppService {
 load():Promise<AdminSnapshot>;
 saveItem(input:ItemInput,id?:string):Promise<void>;
 saveItemNote(itemId:string,note:string):Promise<void>;
 deleteItem(itemId:string):Promise<void>;
 notify(itemId:string,requestId:string):Promise<void>;
 returnItem(itemId:string,email:string,claimId:string,confirmed:boolean):Promise<void>;
 transferItems(itemIds:string[],destination:string,confirmed:boolean):Promise<void>;
 correctReturn(itemId:string,reason:string):Promise<void>;
 reconcile():Promise<void>;
}
const record = <T,>(row: Row): T => ({...row.value,id:row.id,owner:row.author,etag:row.etag} as T);
const now = (): string => new Date().toISOString();
export class WorkflowService implements AdminAppService {
  public constructor(public repo: AdminRepository, public domains = ['stu.kobe-u.ac.jp'], public appUrl='') {}
  private staff(): void { if (this.repo.user.role !== 'staff') throw new Error('職員の権限が必要です。'); }
  private async profile(): Promise<Profile> {
    const row = (await this.repo.list('profiles')).find(r => r.author === this.repo.user.id);
    if (!row) throw new Error('先に利用者情報を登録してください。');
    return record<Profile>(row);
  }
  public async load(): Promise<AdminSnapshot> {
    const staff = this.repo.user.role === 'staff';
    const tables: Table[] = [staff ? 'items':'public','profiles','requests','claims','notices'];
    if (staff) tables.push('mail');
    const results = await Promise.all(tables.map(t => this.repo.list(t)));
    const get = (t: Table): Row[] => (results[tables.indexOf(t)] || []).filter(r=>!r.value.invalid);
    const own = (rows: Row[]): Row[] => staff ? rows : rows.filter(r => r.author === this.repo.user.id);
    const requests = own(get('requests')).map(r => record<Request>(r));
    const claims = own(get('claims')).map(r => record<Claim>(r));
    // Author is assigned by SharePoint, never by a submitted Owner/UserKey field.
    const profiles = get('profiles');
    [...requests,...claims].forEach(r => {
      const p = profiles.find(x => x.author === r.owner)?.value;
      r.email=p?String(p.email || ''):'';
      if(r.email) {try{r.email=validateSchoolEmail(r.email,this.domains);}catch{r.email='';}}
    });
    const notificationHistory:NotificationHistoryRow[]=staff?get('notices').slice().sort((a,b)=>String(b.value.createdAt).localeCompare(String(a.value.createdAt))).flatMap(notice=>{
      const mail=get('mail').find(row=>!!notice.value.key&&row.value.key===notice.value.key);
      if(!mail)return [];
      const item=get('items').find(row=>row.id===String(notice.value.itemId));
      return [{id:notice.id,itemId:String(notice.value.itemId||'?'),title:String(item?.value.title||'拾得物'),studentId:String(mail.value.email||'').split('@')[0],window:String(notice.value.window||item?.value.window||'未設定'),status:String(mail.value.status||''),sentAt:String(mail.value.modifiedAt||''),error:String(mail.value.error||'')}];
    }):[];
    return {notificationHistory,warnings:results.flatMap((rows,index)=>rows.filter(r=>r.value.invalid).map(r=>`${tables[index]} #${r.id}`)),user:this.repo.user, profile:profiles.filter(r=>r.author===this.repo.user.id).map(r=>record<Profile>(r))[0],
      items:get(staff?'items':'public').map(r=>({...record<Item>(r),id:staff?r.id:String(r.value.sourceId)})).filter(i=>staff || (!i.valuable && i.status==='保管中')),
      requests,claims,notices:get('notices').map(r=>({...r.value,id:r.id} as unknown as Notice)).filter(n=>staff || n.owner===this.repo.user.id),
      mail:get('mail').map(r=>record<Mail>(r))};
  }
  public async loadFoundSubmissions():Promise<FoundSubmission[]> {
    return new StudentService(this.repo,this.domains).loadFoundSubmissions();
  }
  public async submitFoundItem(input:FoundSubmissionInput):Promise<void> {
    await new StudentService(this.repo,this.domains).submitFoundItem(input);
  }
  public async saveProfile(input: Omit<Profile,'id'>): Promise<void> {
    const email = this.repo.user.role === 'staff' ? this.repo.user.email : validateSchoolEmail(input.email,this.domains);
    if (this.repo.user.role === 'student' && email !== this.repo.user.email.toLowerCase()) throw new Error('サインイン中の学校メールを登録してください。');
    const old = (await this.repo.list('profiles')).find(r=>r.author===this.repo.user.id);
    await this.repo.put('profiles',{email,window:input.window},old?.id,old?.etag);
  }
  public async saveRequest(criteria: Criteria, feature: string, id?: string): Promise<void> {
    validateCriteria(criteria); if (!criteria.parent) throw new Error('種類を選択してください。');
    const p=await this.profile(); const old=id?(await this.repo.list('requests')).find(r=>r.id===id):undefined;
    if(id && (!old || old.author!==this.repo.user.id || old.value.status!=='ACTIVE')) throw new Error('この紛失申告は編集できません。');
    await this.repo.put('requests',{owner:this.repo.user.id,email:p.email,criteria,feature:feature.trim(),valuable:false,status:'ACTIVE',createdAt:now()},id,old?.etag);
  }
  public async cancelRequest(id: string): Promise<void> {
    await new StudentService(this.repo,this.domains).cancelRequest(id);
  }
  public async cancelClaim(id: string): Promise<void> { await new StudentService(this.repo,this.domains).cancelClaim(id); }
  public async createClaim(itemId: string, feature: string, requestId=''): Promise<void> {
    await new StudentService(this.repo,this.domains).createClaim(itemId,feature,requestId);
  }
  public async saveItemNote(itemId:string,note:string):Promise<void> {
    this.staff();
    const item=(await this.repo.list('items')).find(row=>row.id===itemId);
    if(!item)throw new Error('対象を開き直してください。');
    await this.repo.put('items',{...item.value,internalNote:note.trim()},item.id,item.etag);
  }
  public async saveItem(input: ItemInput,id?: string): Promise<void> {
    this.staff();
    if(!input.parent || !input.category || !input.campus || !input.window.trim()) throw new Error('種類・細かい種類・拾得キャンパス・保管場所を入力してください。');
    validateCriteria({...input,campuses:[input.campus],dateFrom:'',dateTo:'',query:''});
    if(input.foundOn && input.foundOn > today()) throw new Error('拾得日に未来の日付は指定できません。');
    const old=id?(await this.repo.list('items')).find(r=>r.id===id):undefined;
    if(id && (!old || old.value.status!=='保管中')) throw new Error('保管中の拾得物だけ編集できます。');
    if(input.finderEmail) validateSchoolEmail(input.finderEmail,this.domains);
    const value={...old?.value,...input,title:categoryName(input.parent,input.category),valuable:input.valuable,status:'保管中',createdAt:old?.value.createdAt || now()};
    const itemId=await this.repo.put('items',value,id,old?.etag);
    // The primary record is committed first. Reconciliation is repeatable after any partial failure.
    try { await this.reconcile(); } catch { throw new Error(`拾得物 #${itemId} の保存は完了しました。公開・通知への反映が未完了です。「再同期」を実行してください。再登録は不要です。`); }
  }
  public async deleteItem(itemId:string):Promise<void> {
    this.staff();
    const data=await this.load();const item=data.items.find(row=>row.id===itemId);
    if(!item||item.status!=='保管中'||!data.profile?.window||item.window!==data.profile.window)throw new Error('所属窓口の保管中の品物だけ削除できます。');
    if(item.claimId||item.requestId||item.returnedAt||item.recipientEmail||item.audit?.length||data.claims.some(c=>c.itemId===itemId)||data.notices.some(n=>n.itemId===itemId))throw new Error('申出・通知・返却履歴がある品物は削除できません。');
    await this.repo.put('items',{...item,valuable:true},item.id,item.etag);
    const projections=await this.repo.list('public');
    for(const row of projections.filter(r=>String(r.value.sourceId)===itemId))await this.repo.remove('public',row.id);
    await this.repo.remove('items',itemId);
  }
  public async notify(itemId: string,requestId: string): Promise<void> {
    this.staff(); const data=await this.load(); const item=data.items.find(i=>i.id===itemId); const r=data.requests.find(q=>q.id===requestId);
    if(!item || !r || !r.email || item.status!=='保管中' || r.status!=='ACTIVE' || !item.valuable) throw new Error('保管中の非公開品と、有効な紛失申告を選択してください。');
    if(data.claims.some(claim=>claim.requestId===requestId && claim.owner===r.owner && (claim.status==='PENDING'||claim.status==='RETURNED'))) throw new Error('受け取り予定・受け取り済みの登録には追加案内できません。');
    for(const closed of (await this.repo.list('claims')).filter(row=>row.author===r.owner && row.value.itemId===itemId && row.value.status==='UNAVAILABLE')) {
      await this.repo.put('claims',{...closed.value,status:'CANCELLED'},closed.id,closed.etag);
    }
    await this.notice({owner:r.owner,email:r.email,itemId,requestId,claimId:'',title:'窓口からのお知らせ',window:item.window,kind:'VALUABLE',message:'登録した紛失申告に該当する可能性のある拾得物を保管しています。品物の詳細は公開していません。受取窓口で本人確認を受けてください。',createdAt:now()});
  }
  private async notice(value: Omit<Notice,'id'>, cache?: {notices:Row[];mail:Row[]}): Promise<void> {
    const key=[value.kind,value.itemId,value.owner,value.requestId,value.claimId].join(':');
    const notices=cache?.notices || await this.repo.list('notices');
    const existing=notices.find(r=>r.value.key===key);
    const id=existing?.id || await this.repo.put('notices',{...value,key});
    if(value.owner && !existing?.value.accessGranted) {
      await this.repo.grantNotice(id,value.owner);
      const row=(await this.repo.list('notices')).find(r=>r.id===id);
      if(!row) throw new Error('作成した通知を確認できません。再同期してください。');
      await this.repo.put('notices',{...row.value,accessGranted:true},id,row.etag);
      if(existing) existing.value.accessGranted=true;
    }
    if(!existing) notices.push({id,author:this.repo.user.id,value:{...value,key,accessGranted:true}});
    const mail=cache?.mail || await this.repo.list('mail');
    if(value.email && !mail.some(r=>r.value.key===key)) {
      const entry={key,email:value.email,subject:value.title,body:`${value.message}\n受取窓口：${value.window}${this.appUrl?`\n${this.appUrl}?lfNotice=${encodeURIComponent(id)}`:''}`,status:'PENDING'};
      const mailId=await this.repo.put('mail',entry); mail.push({id:mailId,author:this.repo.user.id,value:entry});
    }
  }
  public async returnItem(itemId: string,email: string,claimId: string,confirmed: boolean): Promise<void> {
    this.staff(); if(!confirmed) throw new Error('対面での本人確認を完了してください。');
    const recipient=validateSchoolEmail(email,this.domains);
    const data=await this.load();
    const item=data.items.find(i=>i.id===itemId);
    const claim=data.claims.find(c=>c.id===claimId);
    if(!item || item.status!=='保管中') throw new Error(`#${itemId} はすでに返却済みか、保管中ではありません。一覧を更新してください。`);
    if(!data.profile?.window || item.window!==data.profile.window) throw new Error('返却できるのは所属窓口の拾得物だけです。');
    if(claimId && (!claim || claim.status!=='PENDING' || claim.itemId!==itemId || claim.email!==recipient)) throw new Error('申出の対象・返却先メールが一致しません。');
    const returnedAt=now();
    await this.repo.put('items',{...item,status:'返却済み',recipientEmail:recipient,returnedAt,returnedBy:this.repo.user.email,claimId,requestId:claim?.requestId || ''},item.id,item.etag);
    try { await this.reconcile(); } catch { throw new Error('返却記録は保存済みです。公開・通知の反映に失敗しました。「再同期」を実行してください。'); }
  }
  public async transferItems(itemIds: string[],destination: string,confirmed: boolean): Promise<void> {
    this.staff(); if(!confirmed) throw new Error('移管する現物と移管先を確認してください。');
    const target=destination.trim();if(!target)throw new Error('移管先を入力してください。');
    const profile=await this.profile();const rows=await this.repo.list('items');
    const ids=[...new Set(itemIds)];if(!ids.length)throw new Error('移管する拾得物を選択してください。');
    const items=ids.map(id=>rows.find(row=>row.id===id));
    if(items.some(item=>!item||item.value.status!=='保管中'))throw new Error('保管中ではない品物があります。一覧を更新してください。');
    if(items.some(item=>item?.value.window!==profile.window))throw new Error('移管できるのは所属窓口の拾得物だけです。');
    const transferredAt=now();
    for(const item of items)if(item){const note=String(item.value.internalNote||'');await this.repo.put('items',{...item.value,status:'移管済み',internalNote:`${note}${note?'\n':''}[移管 ${transferredAt}] 移管先：${target}／担当：${this.repo.user.email}`},item.id,item.etag);}
    await this.reconcile();
  }
  public async correctReturn(itemId: string,reason: string): Promise<void> {
    this.staff(); if(!reason.trim()) throw new Error('訂正理由を入力してください。');
    const item=(await this.load()).items.find(i=>i.id===itemId);
    if(!item || item.status!=='返却済み') throw new Error('返却済みの記録ではありません。');
    await this.repo.put('items',{...item,status:'保管中',recipientEmail:'',returnedAt:'',returnedBy:'',claimId:'',requestId:'',audit:[...(item.audit || []),{at:now(),by:this.repo.user.email,reason:reason.trim(),recipient:item.recipientEmail || '',returnedAt:item.returnedAt || '',requestId:item.requestId || ''}]},itemId,item.etag);
    try {await this.reconcile();}catch{throw new Error('訂正は保存済みです。公開・通知の反映は「再同期」を実行してください。');}
  }
  public async reconcile(): Promise<void> {
    this.staff(); const data=await this.load(); const projections=await this.repo.list('public');
    const requests=await this.repo.list('requests');
    const claims=await this.repo.list('claims');
    const submissions=await this.repo.list('submissions');
    const cache={notices:await this.repo.list('notices'),mail:await this.repo.list('mail')};
    for(const item of data.items) {
      const submission=submissions.find(row=>row.id===item.studentSubmissionKey && row.value.status==='ACCEPTED' && row.value.itemId===item.id);
      if(submission) {
        const returnedAt=item.status==='返却済み'?(item.returnedAt || ''):'';
        if(submission.value.itemStatus!==item.status || (submission.value.returnedAt || '')!==returnedAt) await this.repo.put('submissions',{...submission.value,itemStatus:item.status,returnedAt},submission.id,submission.etag);
      }
      const projection=projections.find(r=>String(r.value.sourceId)===item.id);
      if(item.status==='保管中' && item.audit?.length) {
        const last=item.audit[item.audit.length-1];const r=requests.find(x=>x.id===last.requestId);
        if(r?.value.status==='RESOLVED' && !data.items.some(i=>i.status==='返却済み' && i.requestId===r.id)) await this.repo.put('requests',{...r.value,status:'ACTIVE'},r.id,r.etag);
        for(const claim of claims.filter(row=>row.value.itemId===item.id && row.value.status==='RETURNED')) await this.repo.put('claims',{...claim.value,status:'PENDING',returnedAt:''},claim.id,claim.etag);
      }
      if(item.status==='保管中' && !item.valuable) {
        const safe={...publicItem(item),sourceId:item.id};
        if(!projection || Object.keys(projection.value).length!==Object.keys(safe).length || Object.entries(safe).some(([k,v])=>JSON.stringify(projection.value[k])!==JSON.stringify(v))) await this.repo.put('public',safe,projection?.id,projection?.etag);
        // New found-item registration only; conditions created afterwards are never retroactively matched.
        for(const r of data.requests.filter(q=>!!q.email && q.createdAt <= item.createdAt && matchesRequest(item,q) && !data.claims.some(c=>c.requestId===q.id && c.owner===q.owner && (c.status==='PENDING'||c.status==='RETURNED')))) {
          await this.notice({owner:r.owner,email:r.email,itemId:item.id,requestId:r.id,claimId:'',kind:'MATCH',title:'条件に近い落とし物が届きました',window:item.window,message:`${item.title}が届いています。詳細を確認してからお申し出ください。`,createdAt:now()},cache);
        }
      } else if(projection) await this.repo.remove('public',projection.id);
      if(item.status==='返却済み') {
        const claim=claims.find(row=>row.id===item.claimId && row.value.itemId===item.id);
        if(claim && claim.value.status!=='RETURNED') await this.repo.put('claims',{...claim.value,status:'RETURNED',returnedAt:item.returnedAt || now()},claim.id,claim.etag);
        const request=requests.find(r=>r.id===item.requestId);
        if(request && request.value.status==='ACTIVE') await this.repo.put('requests',{...request.value,status:'RESOLVED'},request.id,request.etag);
        for(const other of claims.filter(row=>row.value.itemId===item.id && row.id!==item.claimId && row.value.status==='PENDING')) {
          await this.repo.put('claims',{...other.value,status:'UNAVAILABLE'},other.id,other.etag);
        }
        await this.finderThanks(item.id);
      }
    }
  }
  private async finderThanks(itemId:string):Promise<void> {
    const item=(await this.repo.list('items')).find(row=>row.id===itemId);
    if(!item || item.value.status!=='返却済み')return;
    let email:string;
    if(item.value.studentSubmissionKey){
      const submission=(await this.repo.list('submissions')).find(row=>row.id===item.value.studentSubmissionKey);
      // A missing/invalid original submission never falls back to FinderEmail.
      if(!submission?.author || submission.value.receiveReturnEmail!==true)return;
      email=String(submission.value.email || '');
    }else email=String(item.value.finderEmail || '');
    if(!email.trim())return;
    try{email=validateSchoolEmail(email,this.domains);}catch{return;}
    const key=`FINDER_RETURN:${item.id}:${item.value.studentSubmissionKey || ''}`;
    if((await this.repo.list('mail')).some(row=>row.value.key===key))return;
    await this.repo.put('mail',{key,email,subject:'届けてくださってありがとうございました',body:'届けてくださった落とし物は、持ち主に返却できました。ご協力ありがとうございました。',status:'PENDING',error:''});
  }
}
