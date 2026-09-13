// SharePoint columns can also be edited outside this UI. A malformed personal
// record must not block the counter's entire list or trigger a message.
export function validRecord(table: string, value: unknown): value is Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value)) return false;
  const v=value as Record<string,unknown>;
  const strings=(...keys:string[]):boolean=>keys.every(k=>typeof v[k]==='string');
  const colors=(x:unknown):boolean=>Array.isArray(x) && x.every(c=>typeof c==='string');
  if(table==='profiles') return strings('email','window');
  if(table==='requests') {
    const c=v.criteria as Record<string,unknown> | undefined;
    return strings('feature','status','createdAt') && ['ACTIVE','CANCELLED','RESOLVED'].includes(String(v.status)) && !!c && ['parent','category','campus','building','dateFrom','dateTo','query'].every(k=>typeof c[k]==='string') && colors(c.colors);
  }
  if(table==='claims') return strings('email','itemId','requestId','feature','title','window','createdAt') && ['PENDING','CANCELLED'].includes(String(v.status));
  if(table==='notices') return strings('key','owner','email','itemId','requestId','claimId','title','window','message','createdAt') && ['MATCH','VALUABLE','RETURN','FINDER'].includes(String(v.kind));
  if(table==='public') return strings('sourceId','parent','category','title','campus','building','place','foundOn','window','feature','status','createdAt') && typeof v.valuable==='boolean' && colors(v.colors);
  if(table==='thanks') return strings('claimId','message','createdAt');
  if(table==='publicThanks') return strings('sourceId','message','createdAt');
  if(table==='mail') return strings('key','email','subject','body') && ['PENDING','PROCESSING','SENT','ERROR'].includes(String(v.status));
  return false;
}
