import { validRecord } from './validation';
import { SPHttpClient } from '@microsoft/sp-http';
import { Row, Repository, Table } from './service';
import { User, splitColors, isValuable } from './model';
import { normalizeCategoryCodes } from '../found-items/utils/categories';

export const LISTS: Record<Table,string> = {items:'FoundItems',public:'LFPublicItems',profiles:'LFProfiles',requests:'LFRequests',claims:'LFClaims',notices:'LFNotices',thanks:'LFThanks',publicThanks:'LFPublicThanks',mail:'LFMailOutbox'};

const text = (value: unknown): string => value === undefined || value === null ? '' : String(value);
const date = (value: unknown): string => text(value).slice(0,10);
const authorEmail = (row: Record<string,unknown>): string => text((row.Author as Record<string,unknown> | undefined)?.EMail).toLowerCase();
const status = (value: unknown): string => text((value as {Value?:unknown} | undefined)?.Value ?? value);

function decodeRow(table: Exclude<Table,'items'>, row: Record<string,unknown>): Record<string,unknown> {
  const createdAt=text(row.Created);
  if(table==='public') return {sourceId:text(row.SourceItemId),parent:text(row.ParentCategoryCode),category:text(row.CategoryCode),title:text(row.ItemTitle),colors:splitColors(row.Colors),campus:text(row.CampusCode),building:text(row.BuildingCode),place:text(row.Place),foundOn:date(row.FoundOn),window:text(row.StorageWindow),feature:text(row.Feature),valuable:false,status:status(row.ItemStatus),createdAt:text(row.SourceCreatedAt)||createdAt};
  if(table==='profiles') return {email:authorEmail(row),window:text(row.DefaultWindow)};
  if(table==='requests') return {email:authorEmail(row),criteria:{parent:text(row.ParentCategoryCode),category:text(row.CategoryCode),colors:splitColors(row.Colors),campus:text(row.CampusCode),building:text(row.BuildingCode),dateFrom:date(row.LostFrom),dateTo:date(row.LostTo),query:text(row.SearchQuery)},feature:text(row.Feature),valuable:false,status:status(row.RequestStatus),createdAt};
  if(table==='claims') return {email:authorEmail(row),itemId:text(row.ItemId),requestId:text(row.RequestId),feature:text(row.Feature),title:text(row.ItemTitle),window:text(row.StorageWindow),status:status(row.ClaimStatus),createdAt};
  if(table==='notices') return {key:text(row.NotificationKey),owner:text(row.RecipientUserId),email:text(row.RecipientEmail).toLowerCase(),itemId:text(row.ItemId),requestId:text(row.RequestId),claimId:text(row.ClaimId),kind:status(row.NoticeKind),title:text(row.ItemTitle),window:text(row.StorageWindow),message:text(row.Message),createdAt:text(row.NoticeCreatedAt)||createdAt};
  if(table==='thanks') return {claimId:text(row.ClaimId),message:text(row.Message),createdAt};
  if(table==='publicThanks') return {sourceId:text(row.SourceThanksId),message:text(row.Message),createdAt:text(row.SubmittedAt)||createdAt};
  return {key:text(row.NotificationKey),email:text(row.RecipientEmail).toLowerCase(),subject:text(row.MailSubject),body:text(row.MailBody),status:status(row.MailStatus),error:text(row.ErrorMessage)};
}

function encodeRow(table: Exclude<Table,'items'>, value: Record<string,unknown>): Record<string,unknown> {
  const identity=table==='thanks'?`thanks:${text(value.claimId)}`:value.key || (value.sourceId?`${table}:${value.sourceId}`:value.title || value.email || table);
  const title=text(identity).slice(0,255);
  if(table==='public') return {Title:title,SourceItemId:text(value.sourceId),ItemTitle:text(value.title),ParentCategoryCode:text(value.parent),CategoryCode:text(value.category),Colors:splitColors(value.colors).join(';'),CampusCode:text(value.campus),BuildingCode:text(value.building),Place:text(value.place),FoundOn:value.foundOn?`${date(value.foundOn)}T00:00:00Z`:null,StorageWindow:text(value.window),Feature:text(value.feature),ItemStatus:text(value.status),SourceCreatedAt:value.createdAt?text(value.createdAt):null};
  if(table==='profiles') return {Title:title,DefaultWindow:text(value.window)};
  if(table==='requests') {
    const criteria=value.criteria as Record<string,unknown>;
    return {Title:title,ParentCategoryCode:text(criteria.parent),CategoryCode:text(criteria.category),Colors:splitColors(criteria.colors).join(';'),CampusCode:text(criteria.campus),BuildingCode:text(criteria.building),LostFrom:criteria.dateFrom?`${date(criteria.dateFrom)}T00:00:00Z`:null,LostTo:criteria.dateTo?`${date(criteria.dateTo)}T00:00:00Z`:null,SearchQuery:text(criteria.query),Feature:text(value.feature),RequestStatus:text(value.status)};
  }
  if(table==='claims') return {Title:title,ItemId:text(value.itemId),RequestId:text(value.requestId),Feature:text(value.feature),ItemTitle:text(value.title),StorageWindow:text(value.window),ClaimStatus:text(value.status)};
  if(table==='notices') return {Title:title,NotificationKey:text(value.key),RecipientUserId:value.owner?Number(value.owner):null,RecipientEmail:text(value.email).toLowerCase(),ItemId:text(value.itemId),RequestId:text(value.requestId),ClaimId:text(value.claimId),NoticeKind:text(value.kind),ItemTitle:text(value.title),StorageWindow:text(value.window),Message:text(value.message),NoticeCreatedAt:value.createdAt?text(value.createdAt):null};
  if(table==='thanks') return {Title:title,ClaimId:text(value.claimId),Message:text(value.message)};
  if(table==='publicThanks') return {Title:title,SourceThanksId:text(value.sourceId),Message:text(value.message),SubmittedAt:value.createdAt?text(value.createdAt):null};
  return {Title:title,NotificationKey:text(value.key),RecipientEmail:text(value.email).toLowerCase(),MailSubject:text(value.subject),MailBody:text(value.body),MailStatus:text(value.status),ErrorMessage:text(value.error)};
}

export class SharePointRepository implements Repository {
  public constructor(private client: SPHttpClient,private site: string,public user: User) {}
  private base(table: Table): string { return `${this.site}/_api/web/lists/getbytitle('${LISTS[table].replace(/'/g,"''")}')`; }
  private async call(url: string,body?: object,headers: Record<string,string>={}): Promise<Record<string,unknown>> {
    const options={headers:{Accept:'application/json;odata=minimalmetadata','Content-Type':'application/json;odata=nometadata',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})};
    const response=body===undefined?await this.client.get(url,SPHttpClient.configurations.v1,options):await this.client.post(url,SPHttpClient.configurations.v1,options);
    if(!response.ok) throw Object.assign(new Error(response.status===412?'他の職員が更新しました。一覧を更新してからやり直してください。':response.status===403?'この操作の権限がありません。':response.status===404?'必要なリストが未設定です。配置手順のリスト設定を確認してください。':`保存・読込に失敗しました（${response.status}）。入力内容を確認して再試行してください。`),{status:response.status});
    if(response.status===204) return {};
    const text=await response.text(); return text?JSON.parse(text) as Record<string,unknown>:{};
  }
  public async list(table: Table): Promise<Row[]> {
    const filter=table==='public'?"&$filter=ItemStatus eq '保管中'":'';
    let url=`${this.base(table)}/items?$top=1000&$select=*,Author/EMail&$expand=Author${filter}&$orderby=Created desc`; const result: Row[]=[];
    while(url) {
      let body:Record<string,unknown>;
      try{body=await this.call(url);}catch(e){
        // Before the first private notice is granted, SharePoint returns 403 for this list.
        if(table==='notices' && this.user.role==='student' && (e as {status?:number}).status===403) return result;
        throw e;
      }
      const values=(body.value || []) as Record<string,unknown>[];
      for(const r of values) {
        // Legacy staff builds stored internal processing commands in LFNotices.
        // They are not student notifications and must never surface as corrupt data.
        if(table==='notices' && status(r.NoticeKind)==='VALUABLE_PENDING') continue;
        let value: Record<string,unknown>;
        if(table==='items') {
          const category=normalizeCategoryCodes(String(r.ParentCategoryCode || '') || undefined,String(r.CategoryCode || '') || undefined,String(r.Title || ''));
          const status=String(r.Status || '保管中');
          value={parent:category.parentCode || '',category:category.categoryCode || '',title:r.Title || '分類不明',colors:splitColors(r.Color),campus:r.CampusCode || '',building:r.BuildingCode || '',place:r.Place || '',foundOn:r.FoundOn?new Date(String(r.FoundOn)).toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'}):'',window:r.StorageWindow || '',feature:r.Feature || '',valuable:r.IsPublic===false || isValuable(category.parentCode || '',category.categoryCode),status,createdAt:r.Created || '',finderEmail:r.FinderEmail || '',internalNote:r.InternalNote || '',recipientEmail:r.ReturnRecipientEmail || '',returnedAt:r.ReturnedAt || '',returnedBy:r.ReturnedByEmail || '',claimId:r.ClaimId || '',requestId:r.RequestId || '',audit:JSON.parse(String(r.ReturnAudit || '[]'))};
        } else {
          value=decodeRow(table,r);
          if(!validRecord(table,value)) value={invalid:true};
        }
        result.push({id:String(r.Id),author:String(r.AuthorId),etag:String(r['@odata.etag'] || r['odata.etag'] || ''),value});
      }
      const next=String(body['@odata.nextLink'] || body['odata.nextLink'] || '');
      if(next && !next.startsWith(`${this.site}/_api/`)) throw new Error('不正なページングURLです。');
      url=next;
    }
    return result;
  }
  public async put(table: Table,value: object,id?: string,etag?: string): Promise<string> {
    const v=value as Record<string,unknown>;
    if(table!=='items'&&!validRecord(table,v)) throw new Error('保存データの項目または状態値が不正です。');
    if(table==='notices'&&v.owner&&(!Number.isInteger(Number(v.owner))||Number(v.owner)<=0)) throw new Error('通知先のSharePoint利用者IDが不正です。');
    let data: Record<string,unknown>=table==='items'?{}:encodeRow(table,v);
    if(table==='items') data={Title:v.title,ParentCategoryCode:v.parent,CategoryCode:v.category,Color:(v.colors as string[]).join(';'),CampusCode:v.campus,BuildingCode:v.building,Place:v.place,FoundOn:v.foundOn?`${v.foundOn}T00:00:00Z`:null,StorageWindow:v.window,Feature:v.feature,IsPublic:!v.valuable,Status:v.status,FinderEmail:v.finderEmail || '',InternalNote:v.internalNote || '',ReturnRecipientEmail:v.recipientEmail || '',ReturnedAt:v.returnedAt || null,ReturnedByEmail:v.returnedBy || '',ClaimId:v.claimId || '',RequestId:v.requestId || '',ReturnAudit:JSON.stringify(v.audit || [])};
    if(id) {
      if(!etag) throw new Error('更新情報が古くなりました。再読込してください。');
      await this.call(`${this.base(table)}/items(${Number(id)})`,data,{'X-HTTP-Method':'MERGE','IF-MATCH':etag}); return id;
    }
    const result=await this.call(`${this.base(table)}/items`,data); return String(result.Id);
  }
  public async remove(table: Table,id: string): Promise<void> {
    const row=(await this.list(table)).find(r=>r.id===id); if(!row) return;
    await this.call(`${this.base(table)}/items(${Number(id)})`,{}, {'X-HTTP-Method':'DELETE','IF-MATCH':row.etag || ''});
  }
}
