import { chromium } from '@playwright/test';
import { readFile,writeFile } from 'node:fs/promises';

const config=JSON.parse(await readFile(process.argv[2] || 'deployment/site.example.json','utf8'));
const schema=JSON.parse(await readFile(new URL('./list-schema.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply');
const schemaOnly=process.argv.includes('--schema-only');
const removeLegacyContent=process.argv.includes('--remove-legacy-content');
if(removeLegacyContent&&!apply)throw new Error('--remove-legacy-content は --apply と同時に指定してください。');
const browser=await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');

try {
  const page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url().startsWith(config.siteUrl));
  if(!page) throw new Error('検証サイトで手動ログインを完了してください。');
  const result=await page.evaluate(async({config,schema,apply,schemaOnly,removeLegacyContent})=>{
    let digest='';
    const report={mode:apply?'apply':'preview',lists:[],changes:[],migrations:[],currentUser:0};
    const apiRoot=`${config.siteUrl}/_api/`;
    const request=async(path,body,headers={},allowMissing=false)=>{
      if(body!==undefined&&!digest){
        const response=await fetch(`${apiRoot}contextinfo`,{method:'POST',headers:{Accept:'application/json;odata=nometadata'}});
        if(!response.ok)throw new Error('サイトへの書き込み権限を確認してください。');
        digest=(await response.json()).FormDigestValue;
      }
      const url=path.startsWith('https://')?path:`${apiRoot}${path}`;
      const response=await fetch(url,{
        method:body===undefined?'GET':'POST',
        headers:{Accept:'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata',...(body===undefined?{}:{'X-RequestDigest':digest}),...headers},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      if(allowMissing&&(response.status===404||response.status===400))return null;
      if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);
      const responseText=await response.text();
      return responseText?JSON.parse(responseText):{};
    };
    const allPages=async path=>{
      const rows=[];
      let next=path;
      while(next){
        const response=await request(next);
        rows.push(...(response?.value||[]));
        next=String(response?.['@odata.nextLink']||response?.['odata.nextLink']||'');
        if(next&&!next.startsWith(apiRoot))throw new Error('不正なSharePointページングURLを検出しました。');
      }
      return rows;
    };
    const list=title=>`web/lists/getbytitle('${title.replaceAll("'","''")}')`;
    const xmlEscape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
    const fieldXml=field=>{
      const attrs=`Name="${xmlEscape(field.name)}" StaticName="${xmlEscape(field.name)}" DisplayName="${xmlEscape(field.name)}"`;
      if(field.type==='Note')return `<Field Type="Note" ${attrs} RichText="FALSE" NumLines="8" />`;
      if(field.type==='DateOnly')return `<Field Type="DateTime" ${attrs} Format="DateOnly" FriendlyDisplayFormat="Disabled" />`;
      if(field.type==='DateTime')return `<Field Type="DateTime" ${attrs} Format="DateTime" FriendlyDisplayFormat="Disabled" />`;
      if(field.type==='Boolean')return `<Field Type="Boolean" ${attrs}><Default>0</Default></Field>`;
      if(field.type==='Number')return `<Field Type="Number" ${attrs} Decimals="0" />`;
      return `<Field Type="Text" ${attrs} MaxLength="255" />`;
    };
    const expectedType=field=>field.type==='DateOnly'?'DateTime':field.type;
    const ensureField=async(title,field)=>{
      const path=list(title)+`/fields/getbyinternalnameortitle('${field.name}')`;
      const existing=await request(path+'?$select=InternalName,TypeAsString,Indexed',undefined,{},true);
      if(existing&&existing.TypeAsString!==expectedType(field))throw new Error(`${title}.${field.name}は${existing.TypeAsString}型です。${expectedType(field)}型と一致しないため自動変更しません。`);
      if(!existing){
        report.changes.push(`${title}.${field.name} を追加`);
        if(apply)await request(list(title)+'/fields/createfieldasxml',{parameters:{SchemaXml:fieldXml(field),Options:8}});
      }
      if(field.indexed&&(!existing||!existing.Indexed)){
        report.changes.push(`${title}.${field.name} に索引を設定`);
        if(apply)await request(path,{Indexed:true},{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});
      }
    };
    const ensureUniqueTitle=async title=>{
      const path=list(title)+"/fields/getbyinternalnameortitle('Title')";
      const existing=await request(path+'?$select=Indexed,EnforceUniqueValues,Required');
      if(existing.Indexed&&existing.EnforceUniqueValues&&existing.Required)return;
      report.changes.push(`${title}.Title を必須・一意に設定`);
      if(apply)await request(path,{Indexed:true,EnforceUniqueValues:true,Required:true},{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});
    };
    const ensureDefaultView=async(title,fields=[])=>{
      const viewFields=await request(list(title)+'/defaultview/viewfields');
      const current=new Set(viewFields?.Items||[]);
      for(const field of fields){
        if(current.has(field))continue;
        report.changes.push(`${title}の既定ビューに${field}を追加`);
        if(apply)await request(list(title)+`/defaultview/viewfields/addviewfield('${field.replaceAll("'","''")}')`,{});
      }
    };
    const text=value=>value===undefined||value===null?'':String(value);
    const date=(title,field,value)=>{
      if(!value)return null;
      const candidate=String(value).slice(0,10);
      const parsed=new Date(`${candidate}T00:00:00Z`);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(candidate)||Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==candidate)throw new Error(`${title}.${field}に不正な日付があります。`);
      return `${candidate}T00:00:00Z`;
    };
    const dateTime=(title,field,value)=>{
      if(!value)return null;
      const parsed=new Date(String(value));
      if(Number.isNaN(parsed.valueOf()))throw new Error(`${title}.${field}に不正な日時があります。`);
      return parsed.toISOString();
    };
    const colors=(title,value)=>{
      if(value===undefined||value===null)return '';
      if(!Array.isArray(value)||value.some(color=>typeof color!=='string'))throw new Error(`${title}.Colorsの旧データ形式が不正です。`);
      return value.map(text).filter(Boolean).join(';');
    };
    const ownerId=(title,value)=>{
      if(value===undefined||value===null||value==='')return null;
      const parsed=Number(value);
      if(!Number.isInteger(parsed)||parsed<=0)throw new Error(`${title}.RecipientUserIdに不正な値があります。`);
      return parsed;
    };
    const legacyColumns=(title,value)=>{
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${title}のContentにオブジェクトではないデータがあります。`);
      if(title==='LFPublicItems')return {SourceItemId:text(value.sourceId),ItemTitle:text(value.title),ParentCategoryCode:text(value.parent),CategoryCode:text(value.category),Colors:colors(title,value.colors),CampusCode:text(value.campus),BuildingCode:text(value.building),Place:text(value.place),FoundOn:date(title,'FoundOn',value.foundOn),StorageWindow:text(value.window),Feature:text(value.feature),ItemStatus:text(value.status||'保管中'),SourceCreatedAt:dateTime(title,'SourceCreatedAt',value.createdAt)};
      if(title==='LFProfiles')return {DefaultWindow:text(value.window),DefaultCampusCode:text(value.campus)};
      if(title==='LFRequests'){
        if(!value.criteria||typeof value.criteria!=='object'||Array.isArray(value.criteria))throw new Error('LFRequests.criteriaの旧データ形式が不正です。');
        const criteria=value.criteria;
        return {ParentCategoryCode:text(criteria.parent),CategoryCode:text(criteria.category),Colors:colors(title,criteria.colors),CampusCode:text(criteria.campus),BuildingCode:text(criteria.building),LostFrom:date(title,'LostFrom',criteria.dateFrom),LostTo:date(title,'LostTo',criteria.dateTo),SearchQuery:text(criteria.query),Feature:text(value.feature),RequestStatus:text(value.status||'ACTIVE')};
      }
      if(title==='LFClaims')return {ItemId:text(value.itemId),RequestId:text(value.requestId),Feature:text(value.feature),ItemTitle:text(value.title),StorageWindow:text(value.window),ClaimStatus:text(value.status||'PENDING')};
      if(title==='LFNotices')return {NotificationKey:text(value.key),RecipientUserId:ownerId(title,value.owner),RecipientEmail:text(value.email).toLowerCase(),ItemId:text(value.itemId),RequestId:text(value.requestId),ClaimId:text(value.claimId),NoticeKind:text(value.kind),ItemTitle:text(value.title),StorageWindow:text(value.window),Message:text(value.message),NoticeCreatedAt:dateTime(title,'NoticeCreatedAt',value.createdAt)};
      if(title==='LFThanks'){
        const claimId=text(value.claimId);
        if(!claimId)throw new Error('LFThanks.ClaimIdが空の旧データがあります。');
        return {Title:`thanks:${claimId}`,ClaimId:claimId,Message:text(value.message)};
      }
      if(title==='LFPublicThanks')return {SourceThanksId:text(value.sourceId),Message:text(value.message),SubmittedAt:dateTime(title,'SubmittedAt',value.createdAt)};
      if(title==='LFMailOutbox')return {NotificationKey:text(value.key),RecipientEmail:text(value.email).toLowerCase(),MailSubject:text(value.subject),MailBody:text(value.body),MailStatus:text(value.status||'PENDING'),ErrorMessage:text(value.error)};
      throw new Error(`移行定義がないリストです: ${title}`);
    };
    const validateAllowedValues=(title,columns)=>{
      const fields=new Map(schema[title].fields.map(field=>[field.name,field]));
      for(const [name,value] of Object.entries(columns)){
        const allowed=fields.get(name)?.allowedValues;
        if(allowed&&value&&!allowed.includes(value))throw new Error(`${title}.${name}の値「${value}」は許可値に含まれません。`);
      }
    };
    const requiredMigrationFields={
      LFPublicItems:['SourceItemId','ItemTitle','ParentCategoryCode','ItemStatus'],
      LFProfiles:[],
      LFRequests:['ParentCategoryCode','RequestStatus'],
      LFClaims:['ItemId','ItemTitle','ClaimStatus'],
      LFNotices:['NotificationKey','RecipientUserId','NoticeKind'],
      LFThanks:['ClaimId','Message'],
      LFPublicThanks:['SourceThanksId','Message'],
      LFMailOutbox:['NotificationKey','RecipientEmail','MailSubject','MailBody','MailStatus']
    };
    const validateRequiredValues=(title,columns)=>{
      for(const field of requiredMigrationFields[title]||[])if(columns[field]===undefined||columns[field]===null||String(columns[field]).trim()==='')throw new Error(`${title}.${field}が空の旧データがあります。`);
    };
    const prepareMigration=async title=>{
      const contentField=await request(list(title)+"/fields/getbyinternalnameortitle('Content')?$select=InternalName",undefined,{},true);
      if(!contentField)return null;
      const rows=(await allPages(list(title)+"/items?$select=Id,Content&$top=5000")).filter(row=>String(row.Content||'').trim());
      const converted=rows.map(row=>{
        let value;
        try{value=JSON.parse(String(row.Content));}catch{throw new Error(`${title} #${row.Id}のContentが不正なJSONです。全リストの移行を中止しました。`);}
        const columns=legacyColumns(title,value);
        validateAllowedValues(title,columns);
        validateRequiredValues(title,columns);
        return {id:row.Id,columns};
      });
      report.migrations.push({title,records:converted.length,removeColumn:removeLegacyContent?'Content':'検証完了まで保留'});
      return {title,rows:converted};
    };
    const applyMigrations=async plans=>{
      if(!apply)return;
      // Every JSON record in every list has been parsed before the first item update.
      for(const plan of plans)for(const row of plan.rows)await request(list(plan.title)+`/items(${row.id})`,row.columns,{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});
      // Cleanup is a separate, explicit rollout step after application verification.
      if(removeLegacyContent)for(const plan of plans)await request(list(plan.title)+"/fields/getbyinternalnameortitle('Content')",{}, {'X-HTTP-Method':'DELETE','IF-MATCH':'*'});
    };
    const validateUniqueTitles=async(title,plan)=>{
      const overrides=new Map((plan?.rows||[]).filter(row=>row.columns.Title!==undefined).map(row=>[String(row.id),String(row.columns.Title)]));
      const rows=await allPages(list(title)+"/items?$select=Id,Title&$top=5000");
      const seen=new Map();
      for(const row of rows){
        const value=(overrides.get(String(row.Id))??String(row.Title||'')).trim();
        if(!value)throw new Error(`${title} #${row.Id}のTitleが空のため一意制約を設定できません。`);
        const previous=seen.get(value.toLowerCase());
        if(previous)throw new Error(`${title}のTitle「${value}」が #${previous} と #${row.Id} で重複しています。`);
        seen.set(value.toLowerCase(),row.Id);
      }
    };
    const acl=async(title,kind)=>{
      const path=list(title);
      if(schemaOnly){report.lists.push({title,kind,permissions:'未設定（所有者権限が必要）'});return;}
      let old;
      try{old=await request(path+'/roleassignments?$expand=Member,RoleDefinitionBindings');}
      catch(error){
        if(String(error).includes('HTTP 403')){report.lists.push({title,kind,permissions:'現在のアカウントでは確認できません（403）'});return;}
        throw error;
      }
      report.lists.push({title,kind,permissions:old?.value?.map(role=>({id:role.PrincipalId,name:role.Member.Title,roles:role.RoleDefinitionBindings.map(definition=>definition.Name)}))||[]});
      if(!apply)return;
      await request(path+'/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)',{});
      const staff=new Set([report.currentUser,...config.staffPrincipalIds.map(Number)]);
      for(const id of staff)await request(path+`/roleassignments/addroleassignment(principalid=${id},roledefid=1073741829)`,{});
      const all=await request(path+'/roleassignments?$select=PrincipalId');
      for(const role of all.value)if(!staff.has(role.PrincipalId))await request(path+`/roleassignments/getbyprincipalid(${role.PrincipalId})`,{}, {'X-HTTP-Method':'DELETE'});
      if(kind!=='private')for(const id of config.studentPrincipalIds.map(Number))await request(path+`/roleassignments/addroleassignment(principalid=${id},roledefid=${kind==='own'?1073741827:1073741826})`,{});
      await request(path,{ReadSecurity:kind==='own'?2:1,WriteSecurity:kind==='own'?2:1,EnableAttachments:false,EnableVersioning:true},{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});
    };

    report.currentUser=(await request('web/currentuser?$select=Id')).Id;
    report.groups=(await request('web/sitegroups?$select=Id,Title')).value;
    const staffIds=(config.staffPrincipalIds||[]).map(Number);
    const studentIds=(config.studentPrincipalIds||[]).map(Number);
    if(apply&&!schemaOnly&&(!staffIds.length||!studentIds.length))throw new Error('事前確認で表示された職員・学生グループのIDを site.json に設定してください。');
    if(apply&&!schemaOnly&&staffIds.some(id=>studentIds.includes(id)))throw new Error('職員と学生のグループIDが重複しています。');
    if(!await request(list(config.foundItemsList)+'?$select=Id',undefined,{},true))throw new Error('既存の FoundItems リストがありません。別サイトを変更しないよう処理を中止しました。');

    const available=[];
    for(const [title,spec] of Object.entries(schema)){
      const existing=await request(list(title)+'?$select=Id,Title',undefined,{},true);
      if(!existing){
        report.changes.push(`${title} を作成`);
        if(!apply)continue;
        await request('web/lists',{Title:title,BaseTemplate:100,Description:'落とし物システム QRなし版'});
      }
      available.push([title,spec]);
    }

    // Preflight every legacy record before adding data or removing Content.
    const migrationPlans=[];
    for(const [title] of available){
      const plan=await prepareMigration(title);
      if(plan)migrationPlans.push(plan);
    }
    const plansByTitle=new Map(migrationPlans.map(plan=>[plan.title,plan]));
    for(const [title,spec] of available)if(spec.uniqueTitle)await validateUniqueTitles(title,plansByTitle.get(title));
    for(const [title,spec] of available){
      for(const field of spec.fields)await ensureField(title,field);
      await ensureDefaultView(title,spec.viewFields);
    }
    await applyMigrations(migrationPlans);
    for(const [title,spec] of available){
      if(spec.uniqueTitle)await ensureUniqueTitle(title);
      await acl(title,spec.access);
    }

    for(const [name,type] of [['FinderEmail','Text'],['ClaimId','Text'],['RequestId','Text'],['InternalNote','Note'],['ReturnAudit','Note']])await ensureField(config.foundItemsList,{name,type});
    const status=await request(list(config.foundItemsList)+"/fields/getbyinternalnameortitle('Status')?$select=TypeAsString,Choices");
    if(apply&&status.TypeAsString==='Choice')await request(list(config.foundItemsList)+"/fields/getbyinternalnameortitle('Status')",{Choices:[...new Set([...(status.Choices||[]),'保管中','返却済み','移管済み','処分済み'])]},{'X-HTTP-Method':'MERGE','IF-MATCH':'*'});
    await acl(config.foundItemsList,'private');
    return report;
  },{config,schema,apply,schemaOnly,removeLegacyContent});
  await writeFile('deployment/last-provision-report.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
