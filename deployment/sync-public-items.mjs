import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const config=JSON.parse(await readFile(process.argv[2] || 'deployment/site.example.json','utf8'));
const policy=JSON.parse(await readFile(new URL('../src/webparts/lostFoundStudent/found-items/data/publication-policy.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply');
const browser=await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');

try {
  const page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith(config.siteUrl));
  if(!page)throw new Error('対象SharePointサイトで手動ログインを完了してください。');
  const report=await page.evaluate(async({config,policy,apply})=>{
    let digest='';
    const apiRoot=`${config.siteUrl}/_api/`;
    const list=title=>`web/lists/getbytitle('${title.replaceAll("'","''")}')`;
    const request=async(path,body,headers={})=>{
      if(body!==undefined&&!digest){
        const response=await fetch(`${apiRoot}contextinfo`,{method:'POST',headers:{Accept:'application/json;odata=nometadata'}});
        if(!response.ok)throw new Error(`書き込み権限を確認できません（HTTP ${response.status}）。`);
        digest=(await response.json()).FormDigestValue;
      }
      const url=path.startsWith('https://')?path:`${apiRoot}${path}`;
      const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{Accept:'application/json;odata=minimalmetadata','Content-Type':'application/json;odata=nometadata',...(body===undefined?{}:{'X-RequestDigest':digest}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);
      const text=await response.text();
      return text?JSON.parse(text):{};
    };
    const allPages=async path=>{
      const rows=[];let next=path;
      while(next){
        const response=await request(next);
        rows.push(...(response.value||[]));
        next=String(response['@odata.nextLink']||response['odata.nextLink']||'');
        if(next&&!next.startsWith(apiRoot))throw new Error('不正なSharePointページングURLを検出しました。');
      }
      return rows;
    };
    const value=(input,key)=>input[key]===undefined||input[key]===null?'':String(input[key]);
    const status=input=>value(input,'Status') || '保管中';
    const exclusionReason=item=>{
      if(status(item)!=='保管中')return `状態が「${status(item)}」`;
      if(item.IsPublic!==true)return '公開可に設定されていない';
      if(!value(item,'ParentCategoryCode'))return '種類が未設定';
      if(policy.privateParentCodes.includes(value(item,'ParentCategoryCode')))return '非公開対象の種類';
      if(policy.privateCategoryCodes.includes(value(item,'CategoryCode')))return '非公開対象の細かい種類';
      return '';
    };
    const publicColumns=item=>({
      Title:`public:${item.Id}`,
      SourceItemId:String(item.Id),
      ItemTitle:value(item,'Title'),
      ParentCategoryCode:value(item,'ParentCategoryCode'),
      CategoryCode:value(item,'CategoryCode'),
      Colors:value(item,'Color'),
      CampusCode:value(item,'CampusCode'),
      BuildingCode:value(item,'BuildingCode'),
      Place:value(item,'Place'),
      FoundOn:item.FoundOn || null,
      StorageWindow:value(item,'StorageWindow'),
      Feature:value(item,'Feature'),
      ItemStatus:'保管中',
      SourceCreatedAt:item.Created || null
    });
    const comparable=(row,key)=>{
      const raw=row[key];
      if(raw===undefined||raw===null)return '';
      if(key==='FoundOn')return String(raw).slice(0,10);
      if(key==='SourceCreatedAt')return new Date(String(raw)).toISOString();
      return String(raw);
    };
    const source=await allPages(`${list(config.foundItemsList)}/items?$top=5000&$select=Id,Title,ParentCategoryCode,CategoryCode,Color,CampusCode,BuildingCode,Place,FoundOn,StorageWindow,Feature,IsPublic,Status,Created&$orderby=Id`);
    const current=await allPages(`${list('LFPublicItems')}/items?$top=5000&$select=Id,Title,SourceItemId,ItemTitle,ParentCategoryCode,CategoryCode,Colors,CampusCode,BuildingCode,Place,FoundOn,StorageWindow,Feature,ItemStatus,SourceCreatedAt&$orderby=Id`);
    const bySource=new Map();const titles=new Set();
    for(const row of current){
      const sourceId=value(row,'SourceItemId') || value(row,'Title').replace(/^public:/,'');
      if(!sourceId)throw new Error(`LFPublicItems #${row.Id}にSourceItemIdがありません。`);
      if(bySource.has(sourceId))throw new Error(`LFPublicItemsに原本 #${sourceId}の重複があります。`);
      const title=value(row,'Title').toLowerCase();
      if(titles.has(title))throw new Error(`LFPublicItemsにTitle「${value(row,'Title')}」の重複があります。`);
      titles.add(title);
      const etag=value(row,'@odata.etag') || value(row,'odata.etag');
      if(!etag)throw new Error(`LFPublicItems #${row.Id}のETagを取得できません。`);
      bySource.set(sourceId,{...row,etag});
    }
    const eligible=[];const excluded=[];const create=[];const update=[];
    for(const item of source){
      const reason=exclusionReason(item);
      if(reason){excluded.push({sourceItemId:String(item.Id),title:value(item,'Title'),reason});continue;}
      const columns=publicColumns(item);eligible.push({sourceItemId:String(item.Id),title:value(item,'Title')});
      const existing=bySource.get(String(item.Id));
      if(!existing){
        if(titles.has(columns.Title.toLowerCase()))throw new Error(`LFPublicItemsのTitle「${columns.Title}」が別の原本に使われています。`);
        create.push({columns});continue;
      }
      bySource.delete(String(item.Id));
      const changed=Object.entries(columns).some(([key,expected])=>comparable(existing,key)!==(expected===null?'':key==='FoundOn'?String(expected).slice(0,10):key==='SourceCreatedAt'?new Date(String(expected)).toISOString():String(expected)));
      if(changed)update.push({id:String(existing.Id),etag:existing.etag,columns});
    }
    const remove=[...bySource.values()].map(row=>({id:String(row.Id),etag:row.etag,sourceItemId:value(row,'SourceItemId'),title:value(row,'ItemTitle')}));
    const result={mode:apply?'apply':'preview',sourceCount:source.length,eligibleCount:eligible.length,currentPublicCount:current.length,createCount:create.length,updateCount:update.length,removeCount:remove.length,eligible,excluded,remove};
    if(!apply)return result;
    for(const row of create)await request(`${list('LFPublicItems')}/items`,row.columns);
    for(const row of update)await request(`${list('LFPublicItems')}/items(${Number(row.id)})`,row.columns,{'X-HTTP-Method':'MERGE','IF-MATCH':row.etag});
    for(const row of remove)await request(`${list('LFPublicItems')}/items(${Number(row.id)})`,{}, {'X-HTTP-Method':'DELETE','IF-MATCH':row.etag});
    const after=await allPages(`${list('LFPublicItems')}/items?$top=5000&$select=Id,SourceItemId,ItemStatus`);
    if(after.length!==eligible.length)throw new Error(`同期後の件数が一致しません（期待 ${eligible.length}件、実際 ${after.length}件）。`);
    return {...result,publicCountAfter:after.length};
  },{config,policy,apply});
  await writeFile('deployment/last-public-sync-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(!apply)console.log('内容を確認後、--applyを付けて実行するとLFPublicItemsへ反映します。');
} finally {
  await browser.close();
}
