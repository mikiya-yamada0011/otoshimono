import { CAMPUSES } from './locations';

// SharePoint columns can also be edited outside this UI. A malformed personal
// record must not block the counter's entire list or trigger a message.
export function validRecord(table: string, value: unknown): value is Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value)) return false;
  const v=value as Record<string,unknown>;
  const strings=(...keys:string[]):boolean=>keys.every(k=>typeof v[k]==='string');
  const colors=(x:unknown):boolean=>Array.isArray(x) && x.every(c=>typeof c==='string');
  if(table==='photoBatches') return strings('window','receivedOn') && !!String(v.window).trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(String(v.receivedOn))
    && Number.isFinite(Date.parse(String(v.receivedOn)))
    && new Date(String(v.receivedOn)).toISOString().slice(0,10)===v.receivedOn
    && Array.isArray(v.photos) && v.photos.length <= 3 && v.photos.every(photo => {
      if (!photo || typeof photo!=='object') return false;
      const p=photo as Record<string,unknown>;
      return typeof p.name==='string' && /\.(jpe?g|png|webp)$/i.test(p.name)
        && typeof p.url==='string' && /^https:\/\//.test(p.url);
    });
  if(table==='submissions') return strings('title','parent','category','campus','building','place','foundOn','feature','createdAt') && typeof v.receiveReturnEmail==='boolean' && colors(v.colors) && (v.status===undefined || ['PENDING','PROCESSING','ACCEPTED','REJECTED'].includes(String(v.status))) && (v.itemStatus===undefined || ['','保管中','返却済み','移管済み'].includes(String(v.itemStatus))) && (v.returnedAt===undefined || typeof v.returnedAt==='string');
  if(table==='profiles') return strings('email','window');
  if(table==='requests') {
    const c=v.criteria as Record<string,unknown> | undefined;
    return strings('feature','status','createdAt') && (v.key===undefined || typeof v.key==='string') && ['ACTIVE','CANCELLED','RESOLVED'].includes(String(v.status)) && !!c && ['parent','category','building','dateFrom','dateTo','query'].every(k=>typeof c[k]==='string') && colors(c.colors) && Array.isArray(c.campuses) && c.campuses.every(code=>CAMPUSES.some(campus=>campus.code===code)) && new Set(c.campuses).size===c.campuses.length;
  }
  if(table==='claims') return strings('email','itemId','requestId','feature','title','window','createdAt','returnedAt') && ['PENDING','CANCELLED','RETURNED','UNAVAILABLE'].includes(String(v.status));
  if(table==='notices') return strings('key','owner','email','itemId','requestId','claimId','title','window','message','createdAt') && ['MATCH','VALUABLE'].includes(String(v.kind)) && (v.unavailable===undefined || typeof v.unavailable==='boolean');
  if(table==='public') return (v.transferredAt===undefined || typeof v.transferredAt==='string') && (v.transferDestination===undefined || typeof v.transferDestination==='string') && strings('sourceId','parent','category','title','campus','building','place','foundOn','window','feature','status','createdAt') && typeof v.valuable==='boolean' && colors(v.colors);
  if(table==='mail') return strings('key','email','subject','body') && ['PENDING','PROCESSING','SENT','ERROR'].includes(String(v.status));
  return false;
}
