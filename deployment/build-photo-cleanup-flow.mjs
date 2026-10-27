// Generate a scheduled cleanup definition only. Does not access or delete tenant data.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
export function cleanupDefinition(config){
 const table=config.listIds?.LFDailyPhotoBatches;
 if(!/^https:\/\/[^/]+\.sharepoint\.com\//.test(config.siteUrl)||! /^[0-9a-f-]{36}$/i.test(table||''))throw new Error('Explicit SharePoint site and photo-list GUID are required');
 const base=`_api/web/lists(guid'${table}')/items`;
 const action=(operationId,parameters,runAfter={})=>({type:'OpenApiConnection',inputs:{host:{apiId:'/providers/Microsoft.PowerApps/apis/shared_sharepointonline',connectionName:'shared_sharepointonline',operationId},parameters:{dataset:config.siteUrl,...parameters},authentication:"@parameters('$authentication')"},runAfter});
 const http=(uri,method,headers={},runAfter={})=>action('HttpRequest',{'parameters/uri':uri,'parameters/method':method,'parameters/headers':{Accept:'application/json;odata=minimalmetadata',...headers}},runAfter);
 const latest=`${base}(@{int(items('EachExpired')?['ID'])})`;
 const etag="coalesce(body('ReadCurrent')?['odata.etag'],body('ReadCurrent')?['@odata.etag'],'')";
 const actions={
  CampusMonth:{type:'Compose',inputs:"@formatDateTime(convertTimeZone(utcNow(),'UTC','Tokyo Standard Time'),'yyyy-MM-01')",runAfter:{}},
  CutoffUtc:{type:'Compose',inputs:"@convertToUtc(addToTime(concat(outputs('CampusMonth'),'T00:00:00'),-3,'Month','yyyy-MM-ddTHH:mm:ss'),'Tokyo Standard Time','yyyy-MM-ddTHH:mm:ssZ')",runAfter:{CampusMonth:['Succeeded']}},
  Failures:{type:'InitializeVariable',inputs:{variables:[{name:'CleanupFailures',type:'array',value:[]}]},runAfter:{CutoffUtc:['Succeeded']}},
  Candidates:action('GetItems',{table,'$filter':"ReceivedOn lt datetime'@{outputs('CutoffUtc')}'",'$orderby':'ID asc'},{Failures:['Succeeded']}),
 };
 actions.Candidates.runtimeConfiguration={paginationPolicy:{minimumItemCount:5000}};
 const deleteExpired=http(latest,'POST',{'X-HTTP-Method':'DELETE','IF-MATCH':'@'+etag});
 // Re-read the authoritative date and require an exact ETag. No wildcard overwrite/delete.
 const tryActions={ReadCurrent:http(latest+'?$select=Id,ReceivedOn','GET'),HasDate:{type:'If',expression:"@not(empty(body('ReadCurrent')?['ReceivedOn']))",actions:{StillExpired:{type:'If',expression:`@and(less(ticks(body('ReadCurrent')?['ReceivedOn']),ticks(outputs('CutoffUtc'))),not(empty(${etag})))`,actions:{DeleteExpired:deleteExpired},else:{actions:{}},runAfter:{}}},else:{actions:{}},runAfter:{ReadCurrent:['Succeeded']}}};
 const expiry=tryActions.HasDate.actions.StillExpired;
 expiry.expression="@less(ticks(body('ReadCurrent')?['ReceivedOn']),ticks(outputs('CutoffUtc')))";
 expiry.actions={HasETag:{type:'If',expression:`@not(empty(${etag}))`,actions:{DeleteExpired:deleteExpired},else:{actions:{MissingETag:{type:'AppendToArrayVariable',inputs:{name:'CleanupFailures',value:{itemId:"@items('EachExpired')?['ID']",message:'Missing ETag; item was not deleted.'}},runAfter:{}}}},runAfter:{}}};
 const eachActions={TryItem:{type:'Scope',actions:tryActions,runAfter:{}},RecordFailure:{type:'If',expression:"@not(or(equals(outputs('ReadCurrent')?['statusCode'],404),equals(outputs('DeleteExpired')?['statusCode'],404)))",actions:{AppendFailure:{type:'AppendToArrayVariable',inputs:{name:'CleanupFailures',value:{itemId:"@items('EachExpired')?['ID']",message:'Read/delete failed; check this run. The next daily run retries expired rows.'}},runAfter:{}}},else:{actions:{}},runAfter:{TryItem:['Failed','TimedOut']}}};
 actions.EachExpired={type:'Foreach',foreach:"@body('Candidates')?['value']",actions:eachActions,runtimeConfiguration:{concurrency:{repetitions:1}},runAfter:{Candidates:['Succeeded']}};
 actions.Result={type:'If',expression:"@or(greater(length(variables('CleanupFailures')),0),greaterOrEquals(length(body('Candidates')?['value']),5000),not(equals(actions('EachExpired')?['status'],'Succeeded')))",actions:{Failed:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'PHOTO_CLEANUP_INCOMPLETE',message:'Expired photo cleanup was incomplete. Check failed item actions; the next run retries remaining rows.'}},runAfter:{}}},else:{actions:{Completed:{type:'Compose',inputs:{candidates:"@length(body('Candidates')?['value'])",cutoffUtc:"@outputs('CutoffUtc')"},runAfter:{}}}},runAfter:{EachExpired:['Succeeded','Failed','TimedOut']}};
 return {properties:{displayName:'LFDeleteExpiredDailyPhotos',connectionReferences:config.connectionReferences||{},definition:{$schema:'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',contentVersion:'1.0.0.0',parameters:{$connections:{defaultValue:{},type:'Object'},$authentication:{defaultValue:{},type:'SecureObject'}},triggers:{Daily:{type:'Recurrence',recurrence:{frequency:'Day',interval:1,timeZone:'Tokyo Standard Time',schedule:{hours:[0],minutes:[0]}},runtimeConfiguration:{concurrency:{runs:1}}}},actions,outputs:{}}}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const config=JSON.parse(await readFile(process.argv[2]||resolve(here,'site.example.json'),'utf8'));
 const body=JSON.stringify(cleanupDefinition(config),null,2)+'\n';
 for(const folder of [resolve(here,'flows'),resolve(here,'../../spfx-student-app-QR試行版/deployment/flows')]){await mkdir(folder,{recursive:true});await writeFile(resolve(folder,'写真掲載終了時の自動削除.json'),body);}
 console.log('Generated LFDeleteExpiredDailyPhotos (not deployed). Install one shared flow for both apps.');
}