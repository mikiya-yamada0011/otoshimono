import {transferFields} from './public-transfer.mjs';
// Generate reviewable Power Automate definitions. Nothing is published or sent by this script.
import { readFile,mkdir,rm,writeFile } from 'node:fs/promises';
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
// Legacy false rows have a known contact and stay outside the system.
// New staff registrations always set the compatibility flag to true.
const isPublic=`and(equals(body('Item')?['Status'],'保管中'),equals(body('Item')?['IsPublic'],true),not(empty(body('Item')?['ParentCategoryCode'])))`;
const isPublicProjection=isPublic.replace("equals(body('Item')?['Status'],'保管中')","or(equals(body('Item')?['Status'],'保管中'),equals(body('Item')?['Status'],'移管済み'))");
const triggers=(title)=>({changed:{type:'OpenApiConnection',inputs:{host:{...ref('shared_sharepointonline'),operationId:'GetOnUpdatedItems'},parameters:{dataset:config.siteUrl,table:table(title)},authentication:"@parameters('$authentication')"},recurrence:{frequency:'Minute',interval:1},splitOn:"@triggerOutputs()?['body/value']",runtimeConfiguration:{concurrency:{runs:1}}}});
const schedule={tick:{type:'Recurrence',recurrence:{frequency:'Minute',interval:1},runtimeConfiguration:{concurrency:{runs:1}}}};
const powerAppsItemTrigger={manual:{type:'Request',kind:'PowerAppV2',inputs:{schema:{type:'object',properties:{number:{description:'同期するFoundItemsのID',title:'ItemId',type:'number','x-ms-content-hint':'NUMBER','x-ms-dynamically-added':true},number_1:{description:'旧版との互換入力（使用しません）',title:'RequestId',type:'number','x-ms-content-hint':'NUMBER','x-ms-dynamically-added':true}},required:['number']}}}};
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
pending.compose('OutgoingSubject',"@body('CurrentMail')?['MailSubject']");
pending.compose('OutgoingBody',"@body('CurrentMail')?['MailBody']");
pending.add('Send',{type:'OpenApiConnection',inputs:{host:{...ref('shared_office365'),operationId:'SendEmailV2'},parameters:{'emailMessage/To':"@body('CurrentMail')?['RecipientEmail']",'emailMessage/Subject':"@outputs('OutgoingSubject')",'emailMessage/Body':"<pre>@{replace(replace(replace(outputs('OutgoingBody'),'&','&amp;'),'<','&lt;'),'>','&gt;')}</pre>"},authentication:"@parameters('$authentication')",retryPolicy:{type:'none'}}});
pending.http('AfterSend',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})").http('MarkSent',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'SENT',ErrorMessage:''},{...merge,'IF-MATCH':"@body('AfterSend')?['odata.etag']"});
const failed=new Steps().http('AfterFailure',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})").http('MarkError',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'ERROR',ErrorMessage:'送信結果を実行履歴で確認してください。自動再送はしません。'},{...merge,'IF-MATCH':"@body('AfterFailure')?['odata.etag']"});
failed.actions.AfterFailure.runAfter={Send:['Failed','TimedOut']};Object.assign(pending.actions,failed.actions);
const abandoned=new Steps().condition('Abandoned',"@and(equals(body('CurrentMail')?['MailStatus'],'PROCESSING'),lessOrEquals(ticks(body('CurrentMail')?['Modified']),ticks(addMinutes(utcNow(),-15))))",new Steps().http('MarkAmbiguous',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'ERROR',ErrorMessage:'送信処理が中断され、送信済みか確認できません。実行履歴を確認してから職員が対応してください。'},{...merge,'IF-MATCH':"@body('CurrentMail')?['odata.etag']"}));
const activeMail=new Steps().condition('Pending',"@equals(body('CurrentMail')?['MailStatus'],'PENDING')",pending,abandoned);
const retiredMail=new Steps().http('RetirePersonalThanks',path('LFMailOutbox')+"(@{body('CurrentMail')?['Id']})",{MailStatus:'ERROR',ErrorMessage:'廃止した機能の通知は送信しません。'},{...merge,'IF-MATCH':"@body('CurrentMail')?['odata.etag']"});
send.condition('PersonalThanksRetired',"@and(equals(body('CurrentMail')?['MailStatus'],'PENDING'),or(startsWith(coalesce(body('CurrentMail')?['NotificationKey'],body('CurrentMail')?['Title'],''),'FINDER_'),startsWith(coalesce(body('CurrentMail')?['NotificationKey'],body('CurrentMail')?['Title'],''),'VALUABLE:')))",retiredMail,activeMail);
mail.each('EachMail',"@body('Queue')?['value']",send);await save('メール送信',mail,schedule);
// Re-read the authoritative item for each event, so delayed events do not resurrect returned items.
const projection=new Steps().http('Item',path(config.foundItemsList)+"(@{triggerBody()?['number']})").http('Projection',path('LFPublicItems')+"?$filter=Title eq 'public:@{body('Item')?['Id']}'&$top=1");
const safe={Title:"public:@{body('Item')?['Id']}",SourceItemId:expr(`string(${itemBody})`),ItemTitle:expr(value('Item','Title')),ParentCategoryCode:expr(value('Item','ParentCategoryCode')),CategoryCode:expr(`coalesce(${value('Item','CategoryCode')},'')`),Colors:expr(`coalesce(${value('Item','Color')},'')`),CampusCode:expr(`coalesce(${value('Item','CampusCode')},'')`),BuildingCode:expr(`coalesce(${value('Item','BuildingCode')},'')`),Place:expr(`coalesce(${value('Item','Place')},'')`),FoundOn:expr(value('Item','FoundOn')),StorageWindow:expr(`coalesce(${value('Item','StorageWindow')},'')`),Feature:expr(`coalesce(${value('Item','Feature')},'')`),ItemStatus:expr(value('Item','Status')),...transferFields(),SourceCreatedAt:expr(value('Item','Created'))};
const publish=new Steps();
publish.condition('Exists',"@greater(length(body('Projection')?['value']),0)",new Steps().http('UpdatePublic',path('LFPublicItems')+"(@{first(body('Projection')?['value'])?['Id']})",safe,{...merge,'IF-MATCH':"@first(body('Projection')?['value'])?['odata.etag']"}),new Steps().http('CreatePublic',path('LFPublicItems'),safe));
const unpublish=new Steps().each('RemoveProjection',"@body('Projection')?['value']",new Steps().http('DeletePublic',path('LFPublicItems')+"(@{items('RemoveProjection')?['Id']})",{}, {'X-HTTP-Method':'DELETE','IF-MATCH':"@items('RemoveProjection')?['odata.etag']"}));
projection.condition('Public',expr(isPublicProjection),publish,unpublish);
await rm(`${out}/公開情報同期.json`,{force:true});
await save('PowerApps_即時公開同期',projection,powerAppsItemTrigger,{displayName:'LFSyncPublicItem',invoker:true});
// Retire the generated anonymous-publication definition only; tenant data is retained.
await rm(`${out}/感謝の公開.json`,{force:true});
await rm(`${out}/拾得者へのお礼.json`,{force:true});
console.log('公開情報同期とメール送信の定義を生成しました（未配置）。');
export { Steps, save, path, triggers, config, isPublic, isPublicProjection, safe };
