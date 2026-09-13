import { AppService, Snapshot, User, Profile, Item, Request, Claim, Notice, Thanks, Criteria, isValuable, validateCriteria, validateSchoolEmail } from './model';
export type Table = 'items'|'public'|'profiles'|'requests'|'claims'|'notices'|'thanks'|'publicThanks'|'mail';
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
    const tables: Table[] = ['public','profiles','requests','claims','notices','publicThanks'];
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
      items:get('public').map(r=>({...record<Item>(r),id:String(r.value.sourceId)})).filter(i=>(!i.valuable && !isValuable(i.parent,i.category) && i.status==='保管中')),
      requests,claims,notices:get('notices').map(r=>({...r.value,id:r.id} as unknown as Notice)).filter(n=>n.owner===this.repo.user.id),
      thanks:get('publicThanks').map(r=>record<Thanks>(r)),mail:[]};
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
  public async saveThanks(claimId: string,message: string): Promise<void> {
    const text=message.trim(); if(!text || text.length>200) throw new Error('感謝の一言は1〜200文字で入力してください。');
    if(!(await this.load()).notices.some(n=>n.kind==='RETURN' && n.claimId===claimId && n.owner===this.repo.user.id)) throw new Error('返却済みの申出を選択してください。');
    const old=(await this.repo.list('thanks')).find(r=>r.author===this.repo.user.id && r.value.claimId===claimId);
    if(old) throw new Error('この返却への一言は登録済みです。');
    await this.repo.put('thanks',{claimId,message:text,createdAt:now()});
  }
}
