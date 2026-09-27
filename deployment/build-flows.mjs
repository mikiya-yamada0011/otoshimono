// Generate reviewable Power Automate definitions. Nothing is published or sent by this script.
import { readFile,mkdir,rm,writeFile } from 'node:fs/promises';
import { finderReturnThanks, finderSubmissionHistory, FINDER_RETURN_SUBJECT, FINDER_RETURN_MESSAGE } from './finder-thanks.mjs';
const config=JSON.parse(await readFile(process.argv[2] || 'deployment/site.example.json','utf8'));
const out='deployment/flows';await mkdir(out,{recursive:true});
const ref=key=>({apiId:`/providers/Microsoft.PowerApps/apis/${key}`,connectionName:key});
const path=title=>`_api/web/lists/getbytitle('${title.replaceAll("'","''")}')/items`;
const table=title=>config.listIds?.[title] || title;
class Steps {
  actions={};last='';
  add(name,action){action.runAfter=this.last?{[this.last]:['Succeeded']}:{};this.actions[name]=action;this.last=name;return this;}
  compose(n,v){return this.add(n,{type:'Compose',inputs:v});}
  http(n,uri,body,headers={}){
    if(body!==undefined)this.compose(n+'_Body',body);
    return this.add(n,{type:'OpenApiConnection',inputs:{host:{...ref('shared_sharepointonline'),operationId:'HttpRequest'},parameters:{dataset:config.siteUrl,'parameters/method':body===undefined?'GET':'POST','parameters/uri':uri,'parameters/headers':{Accept:'application/json;odata=minimalmetadata','Content-Type':'application/json;odata=nometadata',...headers},...(body===undefined?{}:{'parameters/body':`@string(outputs('${n}_Body'))`})},authentication:"@parameters('$authentication')"}});
  }
  items(n,title,filter=''){return this.add(n,{type:'OpenApiConnection',inputs:{host:{...ref('shared_sharepointonline'),operationId:'GetItems'},parameters:{dataset:config.siteUrl,table:table(title),...(filter?{'$filter':filter}:{})},authentication:"@parameters('$authentication')"},runtimeConfiguration:{paginationPolicy:{minimumItemCount:5000}}});}
  condition(n,expression,yes,no=new Steps()){return this.add(n,{type:'If',expression,actions:yes.actions,else:{actions:no.actions}});}
  each(n,items,steps){return this.add(n,{type:'Foreach',foreach:items,actions:steps.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});}
}
const expr=x=>'@'+x;
const value=(name,field)=>`body('${name}')?['${field}']`;
const merge={'X-HTTP-Method':'MERGE'};
const itemBody=value('Item','Id');
// IsPublic is a manual staff decision. Categories support search and matching,
// but never silently override the decision made for the actual item.
const isPublic=`and(equals(body('Item')?['Status'],'保管中'),equals(body('Item')?['IsPublic'],true),not(empty(body('Item')?['ParentCategoryCode'])))`;
const triggers=(title)=>({changed:{type:'OpenApiConnection',inputs:{host:{...ref('shared_sharepointonline'),operationId:'GetOnUpdatedItems'},parameters:{dataset:config.siteUrl,table:table(title)},authentication:"@parameters('$authentication')"},recurrence:{frequency:'Minute',interval:1},splitOn:"@triggerOutputs()?['body/value']",runtimeConfiguration:{concurrency:{runs:1}}}});
const schedule={tick:{type:'Recurrence',recurrence:{frequency:'Minute',interval:1},runtimeConfiguration:{concurrency:{runs:1}}}};
const powerAppsItemTrigger={manual:{type:'Request',kind:'PowerAppV2',inputs:{schema:{type:'object',properties:{number:{description:'同期するFoundItemsのID',title:'ItemId',type:'number','x-ms-content-hint':'NUMBER','x-ms-dynamically-added':true},number_1:{description:'本人へ案内する場合のLFRequestsのID',title:'RequestId',type:'number','x-ms-content-hint':'NUMBER','x-ms-dynamically-added':true}},required:['number']}}}};
const invokerAuthentication={value:"@json(decodeBase64(triggerOutputs().headers['X-MS-APIM-Tokens']))['$ConnectionKey']",type:'Raw'};
function withInvokerAuthentication(actions){
  const copy=structuredClone(actions);
  const visit=value=>{
    if(!value||typeof value!=='object')return;
    if(value.type==='OpenApiConnection'&&value.inputs)value.inputs.authentication=invokerAuthentication;
    for(const child of Object.values(value))visit(child);
  };
  visit(copy);return copy;
}
async function save(name,steps,trigger,options={}){
  const actions=options.invoker?withInvokerAuthentication(steps.actions):steps.actions;
  const displayName=options.displayName || '落とし物 QRなし '+name;
  await writeFile(`${out}/${name}.json`,JSON.stringify({properties:{displayName,connectionReferences:config.connectionReferences,definition:{$schema:'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',contentVersion:'1.0.0.0',parameters:{$connections:{defaultValue:{},type:'Object'},$authentication:{defaultValue:{},type:'SecureObject'}},triggers:trigger,actions,outputs:{}}}},null,2)+'\n');
}
// Mail: acquire the queue row with its ETag before sending. Never auto-retry an ambiguous send.
const mail=new Steps().items('Queue','LFMailOutbox',"MailStatus eq 'PENDING' or MailStatus eq 'PROCESSING'");
const send=new Steps().http('CurrentMail',path('LFMailOutbox')+"(@{items('EachMail')?['ID']})");
const pending=new Steps().http('Acquire',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'PROCESSING',ErrorMessage:''},{...merge,'IF-MATCH':"@body('CurrentMail')?['odata.etag']"});
const finderMail="startsWith(coalesce(body('CurrentMail')?['NotificationKey'],body('CurrentMail')?['Title'],''),'FINDER_RETURN:')";
pending.compose('OutgoingSubject',`@if(${finderMail},'${FINDER_RETURN_SUBJECT}',body('CurrentMail')?['MailSubject'])`);
pending.compose('OutgoingBody',`@if(${finderMail},'${FINDER_RETURN_MESSAGE}',body('CurrentMail')?['MailBody'])`);
pending.add('Send',{type:'OpenApiConnection',inputs:{host:{...ref('shared_office365'),operationId:'SendEmailV2'},parameters:{'emailMessage/To':"@body('CurrentMail')?['RecipientEmail']",'emailMessage/Subject':"@outputs('OutgoingSubject')",'emailMessage/Body':"<pre>@{replace(replace(replace(outputs('OutgoingBody'),'&','&amp;'),'<','&lt;'),'>','&gt;')}</pre>"},authentication:"@parameters('$authentication')",retryPolicy:{type:'none'}}});
pending.http('AfterSend',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})").http('MarkSent',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'SENT',ErrorMessage:''},{...merge,'IF-MATCH':"@body('AfterSend')?['odata.etag']"});
const failed=new Steps().http('AfterFailure',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})").http('MarkError',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'ERROR',ErrorMessage:'送信結果を実行履歴で確認してください。自動再送はしません。'},{...merge,'IF-MATCH':"@body('AfterFailure')?['odata.etag']"});
failed.actions.AfterFailure.runAfter={Send:['Failed','TimedOut']};Object.assign(pending.actions,failed.actions);
const abandoned=new Steps().condition('Abandoned',"@and(equals(body('CurrentMail')?['MailStatus'],'PROCESSING'),lessOrEquals(ticks(body('CurrentMail')?['Modified']),ticks(addMinutes(utcNow(),-15))))",new Steps().http('MarkAmbiguous',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'ERROR',ErrorMessage:'送信処理が中断され、送信済みか確認できません。実行履歴を確認してから職員が対応してください。'},{...merge,'IF-MATCH':"@body('CurrentMail')?['odata.etag']"}));
const activeMail=new Steps().condition('Pending',"@equals(body('CurrentMail')?['MailStatus'],'PENDING')",pending,abandoned);
const retiredMail=new Steps().http('RetirePersonalThanks',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'ERROR',ErrorMessage:'自由記述のお礼機能は終了しました。このメールは送信しません。'},{...merge,'IF-MATCH':"@body('CurrentMail')?['odata.etag']"});
send.condition('PersonalThanksRetired',"@and(equals(body('CurrentMail')?['MailStatus'],'PENDING'),startsWith(coalesce(body('CurrentMail')?['NotificationKey'],body('CurrentMail')?['Title'],''),'FINDER_THANKS:'))",retiredMail,activeMail);
mail.each('EachMail',"@body('Queue')?['value']",send);await save('メール送信',mail,schedule);
// Re-read the authoritative item for each event, so delayed events do not resurrect returned items.
const projection=new Steps().http('Item',path(config.foundItemsList)+"(@{triggerBody()?['number']})").http('Projection',path('LFPublicItems')+"?$filter=Title eq 'public:@{body('Item')?['Id']}'&$top=1");
const safe={Title:"public:@{body('Item')?['Id']}",SourceItemId:expr(`string(${itemBody})`),ItemTitle:expr(value('Item','Title')),ParentCategoryCode:expr(value('Item','ParentCategoryCode')),CategoryCode:expr(`coalesce(${value('Item','CategoryCode')},'')`),Colors:expr(`coalesce(${value('Item','Color')},'')`),CampusCode:expr(`coalesce(${value('Item','CampusCode')},'')`),BuildingCode:expr(`coalesce(${value('Item','BuildingCode')},'')`),Place:expr(`coalesce(${value('Item','Place')},'')`),FoundOn:expr(value('Item','FoundOn')),StorageWindow:expr(`coalesce(${value('Item','StorageWindow')},'')`),Feature:expr(`coalesce(${value('Item','Feature')},'')`),ItemStatus:'保管中',SourceCreatedAt:expr(value('Item','Created'))};
const publish=new Steps();
publish.condition('Exists',"@greater(length(body('Projection')?['value']),0)",new Steps().http('UpdatePublic',path('LFPublicItems')+"(@{first(body('Projection')?['value'])?['Id']})",safe,{...merge,'IF-MATCH':"@first(body('Projection')?['value'])?['odata.etag']"}),new Steps().http('CreatePublic',path('LFPublicItems'),safe));
const unpublish=new Steps().each('RemoveProjection',"@body('Projection')?['value']",new Steps().http('DeletePublic',path('LFPublicItems')+"(@{items('RemoveProjection')?['Id']})",{}, {'X-HTTP-Method':'DELETE','IF-MATCH':"@items('RemoveProjection')?['odata.etag']"}));
projection.condition('Public',expr(isPublic),publish,unpublish);
await rm(`${out}/公開情報同期.json`,{force:true});
// Private invitation: validate the current item and request, then create exactly one recipient-scoped notice.
const privateInvite=new Steps().http('Request',path('LFRequests')+"(@{triggerBody()?['number_1']})?$select=*,Author/EMail&$expand=Author")
 .http('PrivateRequestClaims',path('LFClaims')+"?$filter=RequestId eq '@{body('Request')?['Id']}' and AuthorId eq @{body('Request')?['AuthorId']} and (ClaimStatus eq 'PENDING' or ClaimStatus eq 'RETURNED')&$top=1");
const privateValue=new Steps().compose('PrivateValue',{itemId:"@string(body('Item')?['Id'])",window:"@coalesce(body('Item')?['StorageWindow'],'')",key:"@concat('VALUABLE:',string(body('Item')?['Id']),':',string(body('Request')?['AuthorId']),':',string(body('Request')?['Id']),':')",owner:"@string(body('Request')?['AuthorId'])",email:"@toLower(body('Request')?['Author']?['EMail'])",requestId:"@string(body('Request')?['Id'])",claimId:'',kind:'VALUABLE',title:'窓口からのお知らせ',message:'登録した紛失申告に該当する可能性のある拾得物を保管しています。品物の詳細は公開していません。受取窓口で本人確認を受けてください。',createdAt:'@utcNow()'}).http('PrivateExisting',path('LFNotices')+"?$filter=Title eq '@{outputs('PrivateValue')?['key']}'&$top=1");
const createPrivate=new Steps().http('PrivateCreate',path('LFNotices'),{Title:"@outputs('PrivateValue')?['key']",NotificationKey:"@outputs('PrivateValue')?['key']",RecipientUserId:"@int(outputs('PrivateValue')?['owner'])",RecipientEmail:"@outputs('PrivateValue')?['email']",ItemId:"@outputs('PrivateValue')?['itemId']",RequestId:"@outputs('PrivateValue')?['requestId']",ClaimId:'',NoticeKind:'VALUABLE',ItemTitle:"@outputs('PrivateValue')?['title']",StorageWindow:"@outputs('PrivateValue')?['window']",Message:"@outputs('PrivateValue')?['message']",NoticeCreatedAt:"@outputs('PrivateValue')?['createdAt']"});
privateValue.condition('PrivateMissing',"@empty(body('PrivateExisting')?['value'])",createPrivate).http('PrivateRows',path('LFNotices')+"?$filter=Title eq '@{outputs('PrivateValue')?['key']}'&$top=1");
if(config.grantNoticePermissions!==false) privateValue.http('PrivateReset',path('LFNotices')+"(@{first(body('PrivateRows')?['value'])?['Id']})/resetroleinheritance()",{}).http('PrivateBreak',path('LFNotices')+"(@{first(body('PrivateRows')?['value'])?['Id']})/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)",{}).http('PrivateGrant',path('LFNotices')+"(@{first(body('PrivateRows')?['value'])?['Id']})/roleassignments/addroleassignment(principalid=@{outputs('PrivateValue')?['owner']},roledefid=1073741826)",{});
privateValue.http('PrivateMailRows',path('LFMailOutbox')+"?$filter=Title eq '@{outputs('PrivateValue')?['key']}'&$top=1");
const queuePrivateMail=new Steps().http('PrivateMail',path('LFMailOutbox'),{Title:"@outputs('PrivateValue')?['key']",NotificationKey:"@outputs('PrivateValue')?['key']",RecipientEmail:"@outputs('PrivateValue')?['email']",MailSubject:"@outputs('PrivateValue')?['title']",MailBody:`@concat(outputs('PrivateValue')?['message'],decodeUriComponent('%0A'),'受取窓口：',outputs('PrivateValue')?['window'],decodeUriComponent('%0A'),'${config.siteUrl}?lfNotice=',string(first(body('PrivateRows')?['value'])?['Id']))`,MailStatus:'PENDING',ErrorMessage:''});
const retryPrivateMail=new Steps().condition('PrivateMailFailed',"@equals(first(body('PrivateMailRows')?['value'])?['MailStatus'],'ERROR')",new Steps().http('PrivateMailRetry',path('LFMailOutbox')+"(@{first(body('PrivateMailRows')?['value'])?['Id']})",{MailStatus:'PENDING',ErrorMessage:''},{...merge,'IF-MATCH':'*'}));
privateValue.condition('PrivateQueue',"@empty(body('PrivateMailRows')?['value'])",queuePrivateMail,retryPrivateMail);
const rejectPrivate=new Steps().add('RejectInvalid',{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'InvalidPrivateInvite',message:'保管中の非公開品と有効な紛失申告を指定してください。受け取り予定・受け取り済みの登録には追加案内できません。'}}});
const validPrivate="@and(equals(body('Item')?['Status'],'保管中'),equals(body('Item')?['IsPublic'],false),equals(body('Request')?['RequestStatus'],'ACTIVE'),empty(body('PrivateRequestClaims')?['value']),greater(coalesce(body('Request')?['AuthorId'],0),0),not(empty(body('Request')?['Author']?['EMail'])))";
// A staff-confirmed new invitation can renew a previously unavailable candidate
// after correction. It does not automatically recreate an accepted application.
const privateGuidance=new Steps().items('PrivateUnavailableClaims','LFClaims',"ItemId eq '@{body('Item')?['Id']}' and AuthorId eq @{body('Request')?['AuthorId']} and ClaimStatus eq 'UNAVAILABLE'");
const renewCandidate=new Steps()
 .http('RenewItem',path(config.foundItemsList)+"(@{body('Item')?['Id']})")
 .http('RenewClaim',path('LFClaims')+"(@{items('EachPrivateUnavailable')?['ID']})");
renewCandidate.condition('StillRenewable',"@and(equals(body('RenewItem')?['Status'],'保管中'),equals(body('RenewItem')?['IsPublic'],false),equals(body('RenewClaim')?['ItemId'],string(body('RenewItem')?['Id'])),equals(body('RenewClaim')?['AuthorId'],body('Request')?['AuthorId']),equals(body('RenewClaim')?['ClaimStatus'],'UNAVAILABLE'))",new Steps().http('RenewCandidate',path('LFClaims')+"(@{body('RenewClaim')?['Id']})",{ClaimStatus:'CANCELLED'},{...merge,'IF-MATCH':"@body('RenewClaim')?['odata.etag']"}));
privateGuidance.each('EachPrivateUnavailable',"@body('PrivateUnavailableClaims')?['value']",renewCandidate);
for(const [name,action] of Object.entries(privateValue.actions))privateGuidance.add(name,action);
privateInvite.condition('ValidPrivate',validPrivate,privateGuidance,rejectPrivate);
await rm(`${out}/PowerApps_貴重品の個別案内.json`,{force:true});
await rm(`${out}/PowerApps_非公開品の個別案内.json`,{force:true});
projection.condition('PrivateRequested',"@greater(coalesce(triggerBody()?['number_1'],0),0)",privateInvite);
await save('PowerApps_即時公開同期',projection,powerAppsItemTrigger,{displayName:'LFSyncPublicItem',invoker:true});
// Retire the generated anonymous-publication definition only; tenant data is retained.
await rm(`${out}/感謝の公開.json`,{force:true});
// Poll returned rows as well as using item events: an interrupted flow recovers
// on its next run. A unique queue key prevents duplicate thank-you messages.
const finderReturns=finderSubmissionHistory(Steps,path,config).items('ReturnedFinderItems',config.foundItemsList,"Status eq '返却済み' and FinderThanksQueued eq 0 and (StudentSubmissionKey ne null or FinderEmail ne null)");
const returnedFinder=new Steps().http('FinderReturnedItem',path(config.foundItemsList)+"(@{items('EachFinderReturn')?['ID']})");
const returnThanks=finderReturnThanks(Steps,path,config);
for(const [name,action] of Object.entries(returnThanks.actions))returnedFinder.add(name,action);
// Retire only rows with a durable queue record. Otherwise later returns could
// be starved by an ever-growing first page of previously processed history.
returnedFinder.http('FinderReturnDurableQueue',path('LFMailOutbox')+"?$filter=Title eq 'FINDER_RETURN:@{body('FinderReturnedItem')?['Id']}:@{coalesce(body('FinderReturnedItem')?['StudentSubmissionKey'],'')}'&$top=1");
returnedFinder.condition('FinderReturnQueued',"@not(empty(body('FinderReturnDurableQueue')?['value']))",new Steps().http('FinderReturnAcknowledge',path(config.foundItemsList)+"(@{body('FinderReturnedItem')?['Id']})",{FinderThanksQueued:true},{...merge,'IF-MATCH':"@body('FinderReturnedItem')?['odata.etag']"}));
finderReturns.each('EachFinderReturn',"@body('ReturnedFinderItems')?['value']",returnedFinder);
await save('拾得者へのお礼',finderReturns,schedule);
console.log('deployment/flows に3件の定義を生成しました（未配置・未送信）。');
export { Steps, save, path, triggers, config, isPublic };
