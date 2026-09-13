import { CATEGORY_GROUPS } from '../found-items/utils/categories';
import publicationPolicy from '../found-items/data/publication-policy.json';
export const COLORS = ['黒','白','灰','赤','ピンク','橙','黄','緑','青','紺','紫','茶','透明','金','銀','その他'];
export const WINDOWS = ['農学部事務室','工学部事務室','理学部事務室','文学部事務室','図書館カウンター','その他'];
export type Role = 'student' | 'staff';
export type ItemStatus = '保管中' | '返却済み' | '移管済み' | '処分済み';
export interface User { id: string; name: string; email: string; role: Role; }
export interface Profile { id: string; email: string; window: string; }
export interface Criteria { parent: string; category: string; colors: string[]; campus: string; building: string; dateFrom: string; dateTo: string; query: string; }
export interface Item { id: string; parent: string; category: string; title: string; colors: string[]; campus: string; building: string; place: string; foundOn: string; window: string; feature: string; valuable: boolean; status: ItemStatus; createdAt: string; finderEmail?: string; internalNote?: string; recipientEmail?: string; returnedAt?: string; returnedBy?: string; claimId?: string; requestId?: string; audit?: {at:string;by:string;reason:string;recipient:string;returnedAt:string;requestId?:string}[]; etag?: string; }
export interface Request { id: string; owner: string; email: string; criteria: Criteria; feature: string; valuable: boolean; status: 'ACTIVE'|'CANCELLED'|'RESOLVED'; createdAt: string; }
export interface Claim { id: string; owner: string; email: string; itemId: string; requestId: string; feature: string; title: string; window: string; status: 'PENDING'|'CANCELLED'; createdAt: string; }
export interface Notice { id: string; owner: string; email: string; itemId: string; requestId: string; claimId: string; title: string; window: string; message: string; kind: 'MATCH'|'VALUABLE'|'RETURN'|'FINDER'; createdAt: string; }
export interface Thanks { id: string; claimId: string; message: string; createdAt: string; }
export interface Mail { id: string; email: string; subject: string; body: string; status: 'PENDING'|'PROCESSING'|'SENT'|'ERROR'; error?: string; }
export interface Snapshot { warnings?: string[]; user: User; profile?: Profile; items: Item[]; requests: Request[]; claims: Claim[]; notices: Notice[]; thanks: Thanks[]; mail: Mail[]; }
export interface ItemInput extends Omit<Item, 'id'|'status'|'createdAt'|'etag'> {}
export const emptyCriteria = (): Criteria => ({parent:'',category:'',colors:[],campus:'',building:'',dateFrom:'',dateTo:'',query:''});
export const today = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function splitColors(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,、/|]+/) : [];
  return Array.from(new Set(raw.map(x => String(x).trim()).filter(Boolean)));
}
export function isValuable(parent: string, category = ''): boolean {
  return publicationPolicy.privateParentCodes.includes(parent) || publicationPolicy.privateCategoryCodes.includes(category);
}
export function categoryName(parent: string, category: string): string {
  const group = CATEGORY_GROUPS.find(g => g.code === parent);
  return group?.children.find(c => c.code === category)?.name || group?.name || '分類不明';
}
export function matches(item: Item, c: Criteria): boolean {
  if (c.parent && item.parent !== c.parent || c.category && item.category !== c.category) return false;
  if (c.colors.length && !c.colors.some(color => item.colors.includes(color))) return false;
  // 建物は参考情報。未入力や記憶違いで候補を除外しない。
  if (c.campus && item.campus !== c.campus) return false;
  if (c.dateFrom && (!item.foundOn || item.foundOn < c.dateFrom) || c.dateTo && (!item.foundOn || item.foundOn > c.dateTo)) return false;
  const words = c.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return words.every(w => [item.title,item.feature,item.place,item.window,...item.colors].join(' ').toLocaleLowerCase().includes(w));
}
export function matchesRequest(item: Item, request: Request): boolean {
  // 紛失日以降に拾われた物を対象とする。登録日ではなく拾得日で照合する。
  return request.status === 'ACTIVE' && !item.valuable && item.status === '保管中' && matches(item, {...request.criteria, dateTo:''});
}
export function validateCriteria(c: Criteria): void {
  if (c.dateFrom && c.dateTo && c.dateFrom > c.dateTo) throw new Error('日付の開始は終了以前にしてください。');
}
export function validateSchoolEmail(email: string, domains: string[]): string {
  const clean = email.trim().toLowerCase(); const parts = clean.split('@');
  if (parts.length !== 2 || !/^[a-z0-9._+-]+$/.test(parts[0]) || !/\d/.test(parts[0]) || !domains.includes(parts[1])) throw new Error(`学籍番号を含む学校メール（${domains.join(' / ')}）を入力してください。`);
  return clean;
}
export function studentIdFromEmail(email: string): string {
  return email.trim().toLowerCase().split('@')[0] || '学籍番号不明';
}
export function publicItem(item: Item): Item {
  return {id:item.id,parent:item.parent,category:item.category,title:item.title,colors:item.colors,campus:item.campus,building:item.building,place:item.place,foundOn:item.foundOn,window:item.window,feature:item.feature,valuable:item.valuable,status:item.status,createdAt:item.createdAt};
}
export interface AppService {
  readonly domains: string[];
  load(): Promise<Snapshot>;
  saveProfile(profile: Omit<Profile,'id'>): Promise<void>;
  saveRequest(criteria: Criteria, feature: string, id?: string): Promise<void>;
  cancelRequest(id: string): Promise<void>;
  createClaim(itemId: string, feature: string, requestId?: string): Promise<void>;
  cancelClaim(id: string): Promise<void>;
  saveThanks(claimId: string, message: string): Promise<void>;
}
