import { AppService, Snapshot, User, Profile, Item, Request, Claim, Notice, Criteria, validateCriteria, validateSchoolEmail } from '../types/model';
import { FoundSubmission, FoundSubmissionInput, categoryName, today, COLORS, emptyCriteria } from '../types/model';
import { CATEGORY_GROUPS } from '../utils/categories';
import { CAMPUSES } from '../utils/locations';
import { directRequestKey } from '../utils/lostRecords';
export type Table = 'items'|'public'|'profiles'|'requests'|'claims'|'notices'|'mail'|'submissions';
export interface Row { id: string; author: string; etag?: string; value: Record<string, unknown>; }
export interface Repository {
  user: User;
  list(table: Table): Promise<Row[]>;
  put(table: Table, value: object, id?: string, etag?: string): Promise<string>;
  remove(table: Table, id: string): Promise<void>;
}
const record = <T,>(row: Row): T => ({...row.value,id:row.id,owner:row.author,etag:row.etag} as T);
const now = (): string => new Date().toISOString();
export class StudentService implements AppService {
  public constructor(public repo: Repository, public domains = ['stu.kobe-u.ac.jp'], public appUrl='') {}
  private async profile(): Promise<Profile> {
    const email = validateSchoolEmail(this.repo.user.email,this.domains);
    const row = (await this.repo.list('profiles')).find(r => r.author === this.repo.user.id);
    if (!row) {
      const id=await this.repo.put('profiles',{email,window:''});
      return {id,email,window:''};
    }
    const profile=record<Profile>(row);
    if(profile.email!==email) {
      await this.repo.put('profiles',{email,window:profile.window || ''},row.id,row.etag);
      profile.email=email;
    }
    return profile;
  }
  public async load(): Promise<Snapshot> {
    const tables: Table[] = ['public','profiles','requests','claims','notices'];
    const results = await Promise.all(tables.map(t => this.repo.list(t)));
    const get = (t: Table): Row[] => (results[tables.indexOf(t)] || []).filter(r=>!r.value.invalid);
    const own = (rows: Row[]): Row[] => rows.filter(r => r.author === this.repo.user.id);
    const requests = own(get('requests')).map(r => record<Request>(r));
    const claims = own(get('claims')).map(r => record<Claim>(r));
    // Author is assigned by SharePoint, never by a submitted Owner/UserKey field.
    const profiles = get('profiles');
    const email=validateSchoolEmail(this.repo.user.email,this.domains);
    [...requests,...claims].forEach(r => { r.email=email; });
    const storedProfile=profiles.find(r=>r.author===this.repo.user.id);
    const profile=storedProfile?{...record<Profile>(storedProfile),email}:{id:'authenticated-user',email,window:''};
    return {warnings:results.flatMap((rows,index)=>rows.filter(r=>r.value.invalid).map(r=>`${tables[index]} #${r.id}`)),user:this.repo.user, profile,
      items:get('public').map(r=>({...record<Item>(r),id:String(r.value.sourceId)})).filter(i=>(!i.valuable && i.status==='保管中')),
      requests,claims,notices:get('notices').map(r=>({...r.value,id:r.id} as unknown as Notice)).filter(n=>n.owner===this.repo.user.id),
      mail:[]};
  }
  public async loadFoundSubmissions(): Promise<FoundSubmission[]> {
    if(!this.repo.user.id || !this.repo.user.email) throw new Error('学校アカウントでログインしてください。');
    const email=validateSchoolEmail(this.repo.user.email,this.domains);
    const rows=(await this.repo.list('submissions')).filter(row=>row.author===this.repo.user.id);
    if(rows.some(row=>row.value.invalid)) throw new Error('届け出の保存内容を確認できません。窓口に確認してください。');
    return rows.map<FoundSubmission>(row=>({...record<FoundSubmission>(row),email,itemStatus:(row.value.itemStatus || '') as FoundSubmission['itemStatus'],returnedAt:String(row.value.returnedAt || '')})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
  public async submitFoundItem(input: FoundSubmissionInput): Promise<void> {
    if(!this.repo.user.id || !this.repo.user.email) throw new Error('学校アカウントでログインしてください。');
    validateSchoolEmail(this.repo.user.email,this.domains);
    if(typeof input.receiveReturnEmail!=='boolean') throw new Error('お礼メールを受け取るか選択してください。');
    const group=CATEGORY_GROUPS.find(candidate=>candidate.code===input.parent);
    if(!group || !group.children.some(candidate=>candidate.code===input.category)) throw new Error('種類と細かい種類を選択してください。');
    const campus=CAMPUSES.find(candidate=>candidate.code===input.campus);
    if(!campus) throw new Error('拾ったキャンパスを選択してください。');
    if(typeof input.building!=='string' || input.building && !campus.buildings.some(building=>building.code===input.building)) throw new Error('選択したキャンパスの建物・エリアを選択してください。');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.foundOn) || !Number.isFinite(Date.parse(input.foundOn)) || new Date(input.foundOn).toISOString().slice(0,10)!==input.foundOn || input.foundOn>today()) throw new Error('拾った日を正しく入力してください。');
    if(input.place.length>200 || input.feature.length>1000 || input.colors.some(color=>!COLORS.includes(color))) throw new Error('拾った場所・特徴・色を確認してください。');
    // SharePoint Author is the identity of the signed-in connection. Never send
    // a caller-supplied finder email, ownership, decision or publication flag.
    await this.repo.put('submissions',{parent:input.parent,category:input.category,colors:input.colors,campus:input.campus,building:input.building,foundOn:input.foundOn,place:input.place.trim(),feature:input.feature.trim(),receiveReturnEmail:input.receiveReturnEmail,title:categoryName(input.parent,input.category),createdAt:now()});
  }
  public async saveProfile(input: Omit<Profile,'id'>): Promise<void> {
    const email = validateSchoolEmail(input.email,this.domains);
    if (email !== this.repo.user.email.toLowerCase()) throw new Error('このSharePoint環境では、サインイン中の学校メールを登録してください。別の認証方式は未設定です。');
    const old = (await this.repo.list('profiles')).find(r=>r.author===this.repo.user.id);
    await this.repo.put('profiles',{email,window:input.window},old?.id,old?.etag);
  }
  public async saveRequest(criteria: Criteria, feature: string, id?: string): Promise<void> {
    validateCriteria(criteria); if (!criteria.parent) throw new Error('種類を選択してください。');
    const p=await this.profile(); const old=id?(await this.repo.list('requests')).find(r=>r.id===id):undefined;
    if(id && (!old || old.author!==this.repo.user.id || old.value.status!=='ACTIVE')) throw new Error('この登録は編集できません。');
    await this.repo.put('requests',{owner:this.repo.user.id,email:p.email,key:old?.value.key,criteria,feature:feature.trim(),valuable:false,status:'ACTIVE',createdAt:old?.value.createdAt || now()},id,old?.etag);
  }
  public async cancelRequest(id: string): Promise<void> {
    const data=await this.load();
    const request=data.requests.find(candidate=>candidate.id===id && candidate.owner===this.repo.user.id);
    if(!request || request.status!=='ACTIVE') throw new Error('この登録は取り下げできません。');
    for(const claim of data.claims.filter(candidate=>candidate.status==='PENDING' && (
      candidate.requestId===id || (!candidate.requestId && request.key===directRequestKey(candidate.id))
    ))) await this.cancel('claims',claim.id,'PENDING');
    await this.cancel('requests',id,'ACTIVE');
  }
  public async cancelClaim(id: string): Promise<void> { await this.cancel('claims',id,'PENDING'); }
  private async cancel(table: 'requests'|'claims',id: string,state: string): Promise<void> {
    const row=(await this.repo.list(table)).find(r=>r.id===id);
    if(!row || row.author!==this.repo.user.id || row.value.status!==state) throw new Error('取り下げできない申出です。');
    await this.repo.put(table,{...row.value,status:'CANCELLED'},id,row.etag);
  }
  public async createClaim(itemId: string, feature: string, requestId=''): Promise<void> {
    if(feature.trim().length>1000) throw new Error('特徴は1000文字以内で入力してください。');
    const data=await this.load();
    const item=data.items.find(i=>i.id===itemId && i.status==='保管中');
    const invitation=data.claims.some(claim=>claim.itemId===itemId && claim.status==='UNAVAILABLE') ? undefined : data.notices.find(n=>n.itemId===itemId && n.requestId===requestId && n.owner===this.repo.user.id && n.kind==='VALUABLE' && !n.unavailable);
    if(!item && !invitation) throw new Error('この拾得物は現在申し出できません。窓口に確認してください。');
    const existing=data.claims.find(c=>c.itemId===itemId && c.owner===this.repo.user.id && c.status==='PENDING');
    if(existing && (existing.requestId || requestId)) throw new Error('この拾得物はすでに申し出ています。「紛失した物」を確認してください。');
    const request=requestId?data.requests.find(r=>r.id===requestId && r.owner===this.repo.user.id):undefined;
    if(requestId && (!request || request.status!=='ACTIVE')) throw new Error('この登録は受付を終了しています。');
    const directCandidate=request && data.claims.some(claim=>request.key===directRequestKey(claim.id) && claim.itemId===itemId);
    if(requestId && !directCandidate && !data.notices.some(notice=>notice.requestId===requestId && notice.itemId===itemId)) throw new Error('この申告への候補通知が見つかりません。');
    if(requestId && data.claims.some(claim=>claim.requestId===requestId && claim.status==='PENDING')) throw new Error('この登録は受け取り予定です。別の候補に変更する場合は、先に申し込みを取り消してください。');
    const p=await this.profile();
    const value={owner:this.repo.user.id,email:p.email,itemId,requestId,feature:request?.feature ?? feature.trim(),title:item?.title || (request ? categoryName(request.criteria.parent,request.criteria.category) : '拾得物の受け取り申し込み'),window:item?.window || invitation?.window || '',status:'PENDING',createdAt:now(),returnedAt:''};
    const claimId=existing?.id || await this.repo.put('claims',value);
    if(requestId || !item) return;
    // Preserve a saved claim on partial failure. A retry reuses its ID, then
    // reuses the keyed loss record instead of creating duplicate cards.
    try {
      const key=directRequestKey(claimId);
      const rows=await this.repo.list('requests');
      const linked=rows.find(row=>row.author===this.repo.user.id && row.value.key===key);
      const criteria={...emptyCriteria(),parent:item.parent,category:item.category,colors:item.colors};
      // Found location/date are not the student's lost location/date.
      const savedRequestId=linked?.id || await this.repo.put('requests',{key,owner:this.repo.user.id,email:p.email,criteria,
        feature:existing?.feature ?? value.feature,valuable:false,status:'ACTIVE',createdAt:existing?.createdAt || value.createdAt});
      if(linked && linked.value.status!=='ACTIVE') throw new Error('この登録は受付を終了しています。');
      const saved=(await this.repo.list('claims')).find(row=>row.id===claimId && row.author===this.repo.user.id);
      if(!saved || saved.value.status!=='PENDING') throw new Error('申し込みの状態が変更されています。');
      if(saved.value.requestId && saved.value.requestId!==savedRequestId) throw new Error('申し込みの登録先が変更されています。');
      await this.repo.put('claims',{...saved.value,requestId:savedRequestId},claimId,saved.etag);
    } catch(cause) {
      // A lost HTTP response is not a failed commit. Verify the durable link
      // before telling the student to retry an already completed registration.
      try {
        const savedClaims=await this.repo.list('claims');
        const savedRequests=await this.repo.list('requests');
        const saved=savedClaims.find(row=>row.id===claimId && row.author===this.repo.user.id);
        if(saved?.value.requestId && savedRequests.some(row=>row.id===saved.value.requestId && row.author===this.repo.user.id && row.value.key===directRequestKey(claimId))) return;
      } catch { /* Keep the saved claim and report an explicit retry path. */ }
      throw new Error(`受け取り申し込みは保存済みですが、登録の紐づけが未完了です。もう一度申し込みを押して再試行してください。${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}
