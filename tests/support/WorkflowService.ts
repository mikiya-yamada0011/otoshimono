import { AppService, Snapshot, Profile, Item, ItemInput, Request, Claim, Notice, Thanks, Mail, Criteria, categoryName, isValuable, matchesRequest, publicItem, validateCriteria, validateSchoolEmail, today } from '../../src/webparts/lostFoundStudent/app/model';
import { Repository, Row, Table } from '../../src/webparts/lostFoundStudent/app/service';
export interface AdminRepository extends Repository {
  grantNotice(id: string, owner: string): Promise<void>;
}
export interface AdminAppService extends AppService {
 saveItem(input:ItemInput,id?:string):Promise<void>;
 notify(itemId:string,requestId:string):Promise<void>;
 returnItem(itemId:string,email:string,claimId:string,confirmed:boolean):Promise<void>;
 closeItem(itemId:string,status:'移管済み'|'処分済み'):Promise<void>;
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
  public async load(): Promise<Snapshot> {
    const staff = this.repo.user.role === 'staff';
    const tables: Table[] = [staff ? 'items':'public','profiles','requests','claims','notices','publicThanks'];
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
    return {warnings:results.flatMap((rows,index)=>rows.filter(r=>r.value.invalid).map(r=>`${tables[index]} #${r.id}`)),user:this.repo.user, profile:profiles.filter(r=>r.author===this.repo.user.id).map(r=>record<Profile>(r))[0],
      items:get(staff?'items':'public').map(r=>({...record<Item>(r),id:staff?r.id:String(r.value.sourceId)})).filter(i=>staff || (!i.valuable && !isValuable(i.parent,i.category) && i.status==='保管中')),
      requests,claims,notices:get('notices').map(r=>({...r.value,id:r.id} as unknown as Notice)).filter(n=>staff || n.owner===this.repo.user.id),
      thanks:get('publicThanks').map(r=>record<Thanks>(r)),mail:get('mail').map(r=>record<Mail>(r))};
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
  public async cancelRequest(id: string): Promise<void> { await this.cancel('requests',id,'ACTIVE'); }
  public async cancelClaim(id: string): Promise<void> { await this.cancel('claims',id,'PENDING'); }
  private async cancel(table: 'requests'|'claims',id: string,state: string): Promise<void> {
    const row=(await this.repo.list(table)).find(r=>r.id===id);
    if(!row || row.author!==this.repo.user.id || row.value.status!==state) throw new Error('取り下げできない申出です。');
    if(table==='claims' && (await this.load()).notices.some(n=>n.kind==='RETURN' && n.claimId===id)) throw new Error('返却済みの申出は取り下げできません。');
    await this.repo.put(table,{...row.value,status:'CANCELLED'},id,row.etag);
  }
  public async createClaim(itemId: string, feature: string, requestId=''): Promise<void> {
    const data=await this.load(); const p=await this.profile();
    const item=data.items.find(i=>i.id===itemId && i.status==='保管中');
    const invitation=data.notices.find(n=>n.itemId===itemId && n.owner===this.repo.user.id && n.kind==='VALUABLE');
    if(!item && !invitation) throw new Error('この拾得物は現在申し出できません。窓口に確認してください。');
    if(data.claims.some(c=>c.itemId===itemId && c.owner===this.repo.user.id && c.status==='PENDING')) throw new Error('この拾得物はすでに申し出ています。「受け取り申し込み」を確認してください。');
    const request=requestId?data.requests.find(r=>r.id===requestId && r.owner===this.repo.user.id):undefined;
    if(requestId && !request) throw new Error('紛失申告が見つかりません。');
    await this.repo.put('claims',{owner:this.repo.user.id,email:p.email,itemId,requestId,feature:request?.feature || feature.trim(),title:item?.title || '拾得物の受け取り申し込み',window:item?.window || invitation?.window,status:'PENDING',createdAt:now()});
  }
  public async saveItem(input: ItemInput,id?: string): Promise<void> {
    this.staff();
    if(!input.parent || !input.category || !input.campus || !input.window.trim()) throw new Error('種類・細かい種類・拾得キャンパス・保管場所を入力してください。');
    validateCriteria({...input,dateFrom:'',dateTo:'',query:''});
    if(input.foundOn && input.foundOn > today()) throw new Error('拾得日に未来の日付は指定できません。');
    const old=id?(await this.repo.list('items')).find(r=>r.id===id):undefined;
    if(id && (!old || old.value.status!=='保管中')) throw new Error('保管中の拾得物だけ編集できます。');
    if(input.finderEmail) validateSchoolEmail(input.finderEmail,this.domains);
    const value={...old?.value,...input,title:categoryName(input.parent,input.category),valuable:input.valuable || isValuable(input.parent,input.category),status:'保管中',createdAt:old?.value.createdAt || now()};
    const itemId=await this.repo.put('items',value,id,old?.etag);
    // The primary record is committed first. Reconciliation is repeatable after any partial failure.
    try { await this.reconcile(); } catch { throw new Error(`拾得物 #${itemId} の保存は完了しました。公開・通知への反映が未完了です。「再同期」を実行してください。再登録は不要です。`); }
  }
  public async notify(itemId: string,requestId: string): Promise<void> {
    this.staff(); const data=await this.load(); const item=data.items.find(i=>i.id===itemId); const r=data.requests.find(q=>q.id===requestId);
    if(!item || !r || !r.email || item.status!=='保管中' || r.status!=='ACTIVE' || !item.valuable) throw new Error('保管中の非公開品と、有効な紛失申告を選択してください。');
    await this.notice({owner:r.owner,email:r.email,itemId,requestId,claimId:'',title:'窓口からのお知らせ',window:item.window,kind:'VALUABLE',message:'登録した紛失申告に該当する可能性のある拾得物を保管しています。品物の詳細は公開していません。受取窓口で本人確認を受けてください。',createdAt:now()});
  }
  private async notice(value: Omit<Notice,'id'>, cache?: {notices:Row[];mail:Row[]}): Promise<void> {
    const key=[value.kind,value.itemId,value.owner,value.requestId,value.claimId,...(['RETURN','FINDER'].includes(value.kind)?[value.createdAt]:[])].join(':');
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
    const recipient=validateSchoolEmail(email,this.domains); const data=await this.load();
    const item=data.items.find(i=>i.id===itemId); const claim=data.claims.find(c=>c.id===claimId);
    if(!item || item.status!=='保管中') throw new Error('すでに返却済みか、保管中ではありません。一覧を更新してください。');
    if(!data.profile?.window || item.window!==data.profile.window) throw new Error('返却できるのは所属窓口の拾得物だけです。');
    if(claimId && (!claim || claim.status!=='PENDING' || claim.itemId!==itemId || claim.email!==recipient)) throw new Error('申出の対象・返却先メールが一致しません。');
    await this.repo.put('items',{...item,status:'返却済み',recipientEmail:recipient,returnedAt:now(),returnedBy:this.repo.user.email,claimId,requestId:claim?.requestId || ''},item.id,item.etag);
    try { await this.reconcile(); } catch { throw new Error('返却記録は保存済みです。公開・通知の反映に失敗しました。「再同期」を実行してください。'); }
  }
  public async closeItem(itemId: string,status: '移管済み'|'処分済み'): Promise<void> {
    this.staff(); const item=(await this.repo.list('items')).find(r=>r.id===itemId);
    if(!item || item.value.status!=='保管中') throw new Error('保管中の拾得物ではありません。');
    await this.repo.put('items',{...item.value,status},itemId,item.etag); await this.reconcile();
  }
  public async correctReturn(itemId: string,reason: string): Promise<void> {
    this.staff(); if(!reason.trim()) throw new Error('訂正理由を入力してください。');
    const item=(await this.load()).items.find(i=>i.id===itemId);
    if(!item || item.status!=='返却済み') throw new Error('返却済みの記録ではありません。');
    await this.repo.put('items',{...item,status:'保管中',recipientEmail:'',returnedAt:'',returnedBy:'',claimId:'',requestId:'',audit:[...(item.audit || []),{at:now(),by:this.repo.user.email,reason:reason.trim(),recipient:item.recipientEmail || '',returnedAt:item.returnedAt || '',requestId:item.requestId || ''}]},itemId,item.etag);
    try {await this.reconcile();}catch{throw new Error('訂正は保存済みです。公開・通知の反映は「再同期」を実行してください。');}
  }
  public async saveThanks(claimId: string,message: string): Promise<void> {
    const text=message.trim(); if(!text || text.length>200) throw new Error('感謝の一言は1〜200文字で入力してください。');
    if(!(await this.load()).notices.some(n=>n.kind==='RETURN' && n.claimId===claimId && n.owner===this.repo.user.id)) throw new Error('返却済みの申出を選択してください。');
    const old=(await this.repo.list('thanks')).find(r=>r.author===this.repo.user.id && r.value.claimId===claimId);
    if(old) throw new Error('この返却への一言は登録済みです。');
    await this.repo.put('thanks',{claimId,message:text,createdAt:now()});
  }
  public async reconcile(): Promise<void> {
    this.staff(); const data=await this.load(); const projections=await this.repo.list('public');
    const requests=await this.repo.list('requests');
    const profiles=await this.repo.list('profiles');
    const cache={notices:await this.repo.list('notices'),mail:await this.repo.list('mail')};
    // Remove obsolete receipts after a correction. Previously delivered email cannot be recalled.
    for(const n of cache.notices.slice()) if(['RETURN','FINDER'].includes(String(n.value.kind)) && !data.items.some(i=>i.id===n.value.itemId && i.status==='返却済み' && i.returnedAt===n.value.createdAt)) {
      await this.repo.remove('notices',n.id);cache.notices=cache.notices.filter(x=>x.id!==n.id);
      for(const m of cache.mail.filter(x=>x.value.key===n.value.key && x.value.status==='PENDING')) await this.repo.remove('mail',m.id);
    }
    for(const item of data.items) {
      const projection=projections.find(r=>String(r.value.sourceId)===item.id);
      if(item.status==='保管中' && item.audit?.length) {
        const last=item.audit[item.audit.length-1];const r=requests.find(x=>x.id===last.requestId);
        if(r?.value.status==='RESOLVED' && !data.items.some(i=>i.status==='返却済み' && i.requestId===r.id)) await this.repo.put('requests',{...r.value,status:'ACTIVE'},r.id,r.etag);
      }
      if(item.status==='保管中' && !item.valuable && !isValuable(item.parent,item.category)) {
        const safe={...publicItem(item),sourceId:item.id};
        if(!projection || Object.keys(projection.value).length!==Object.keys(safe).length || Object.entries(safe).some(([k,v])=>JSON.stringify(projection.value[k])!==JSON.stringify(v))) await this.repo.put('public',safe,projection?.id,projection?.etag);
        // New found-item registration only; conditions created afterwards are never retroactively matched.
        for(const r of data.requests.filter(q=>!!q.email && q.createdAt <= item.createdAt && matchesRequest(item,q))) {
          await this.notice({owner:r.owner,email:r.email,itemId:item.id,requestId:r.id,claimId:'',kind:'MATCH',title:'条件に近い落とし物が届きました',window:item.window,message:`${item.title}が届いています。詳細を確認してからお申し出ください。`,createdAt:now()},cache);
        }
      } else if(projection) await this.repo.remove('public',projection.id);
      if(item.status==='返却済み') {
        const c=data.claims.find(q=>q.id===item.claimId) || (()=>{const p=profiles.find(r=>r.value.email===item.recipientEmail);return p?{owner:p.author,email:String(p.value.email),id:`walkin-${item.id}-${item.returnedAt}`}:undefined;})();
        if(c) await this.notice({owner:c.owner,email:item.recipientEmail || c.email,itemId:item.id,requestId:item.requestId || '',claimId:c.id,kind:'RETURN',title:'返却が完了しました',window:item.window,message:'お受け取りありがとうございました。任意で感謝の一言を残せます。',createdAt:item.returnedAt || now()},cache);
        const request=requests.find(r=>r.id===item.requestId);
        if(request && request.value.status==='ACTIVE') await this.repo.put('requests',{...request.value,status:'RESOLVED'},request.id,request.etag);
        if(item.finderEmail) {
          const profile=profiles.find(r=>r.value.email===item.finderEmail);
          await this.notice({owner:profile?.author || '',email:item.finderEmail,itemId:item.id,requestId:'',claimId:'',kind:'FINDER',title:'届けていただいた落とし物が持ち主に返りました',window:item.window,message:'ご協力ありがとうございました。',createdAt:item.returnedAt || now()},cache);
        }
      }
    }
    const submissions=await this.repo.list('thanks'); const published=await this.repo.list('publicThanks');
    for(const row of submissions) {
      const receipt=cache.notices.find(n=>n.value.kind==='RETURN' && n.value.claimId===row.value.claimId && n.value.owner===row.author);
      const existing=published.find(r=>r.value.sourceId===row.id);
      if(receipt && !existing) await this.repo.put('publicThanks',{sourceId:row.id,message:String(row.value.message || '').slice(0,200),createdAt:row.value.createdAt});
      if(!receipt && existing) await this.repo.remove('publicThanks',existing.id);
    }
  }
}
