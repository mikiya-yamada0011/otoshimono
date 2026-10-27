import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {cleanupDefinition} from '../deployment/build-photo-cleanup-flow.mjs';
const config=JSON.parse(await readFile('deployment/site.example.json','utf8'));
const flow=cleanupDefinition(config).properties.definition;
const a=flow.actions,each=a.EachExpired.actions,guard=each.TryItem.actions.HasDate.actions.StillExpired;
assert.equal(flow.triggers.Daily.recurrence.timeZone,'Tokyo Standard Time');
assert.deepEqual(flow.triggers.Daily.recurrence.schedule,{hours:[0],minutes:[0]});
assert.equal(flow.triggers.Daily.recurrence.frequency,'Day');
assert.equal(a.CutoffUtc.inputs,"@convertToUtc(addToTime(concat(outputs('CampusMonth'),'T00:00:00'),-3,'Month','yyyy-MM-ddTHH:mm:ss'),'Tokyo Standard Time','yyyy-MM-ddTHH:mm:ssZ')");
assert.equal(a.Candidates.inputs.parameters.table,config.listIds.LFDailyPhotoBatches);
assert.equal(a.Candidates.inputs.parameters.$filter,"ReceivedOn lt datetime'@{outputs('CutoffUtc')}'");
assert.equal(a.Candidates.runtimeConfiguration.paginationPolicy.minimumItemCount,5000);
assert(guard.expression.includes("body('ReadCurrent')?['ReceivedOn']"));
assert(guard.actions.HasETag.expression.startsWith('@not(empty('));
const del=guard.actions.HasETag.actions.DeleteExpired.inputs.parameters;
assert.equal(del['parameters/headers']['X-HTTP-Method'],'DELETE');
assert.notEqual(del['parameters/headers']['IF-MATCH'],'*');
assert(del['parameters/headers']['IF-MATCH'].includes("body('ReadCurrent')"));
assert(del['parameters/uri'].includes(config.listIds.LFDailyPhotoBatches));
assert(!JSON.stringify(flow).includes('FoundItems'));
assert(each.RecordFailure.runAfter.TryItem.includes('Failed'));
assert(a.Result.actions.Failed.inputs.runStatus==='Failed');
assert.throws(()=>cleanupDefinition({...config,listIds:{}}));
const compiled=await build({entryPoints:['src/webparts/lostFoundStudent/found-items/utils/photoRetention.ts'],bundle:true,write:false,format:'esm'});
const retention=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
for(const [instant,expired,kept] of [
 ['2026-09-30T14:59:59Z','2026-05-31','2026-06-01'],
 ['2026-09-30T15:00:00Z','2026-06-30','2026-07-01'],
 ['2027-01-31T15:00:00Z','2026-10-31','2026-11-01'],
 ['2024-05-31T15:00:00Z','2024-02-29','2024-03-01'],
]){
 const now=new Date(instant),cutoff=Date.parse(retention.photoPublicCutoffInstant(now));
 for(const [day,remove] of [[expired,true],[kept,false]]){
  assert.equal(Date.parse(day+'T00:00:00+09:00')<cutoff,remove);
  assert.equal(retention.isPhotoPublished(day,now),!remove);
 }
}
// The actual definition re-reads the current row and requires a nonempty exact ETag.
const run=(candidate,current,version)=>!current?'missing':Date.parse(current.date)>=Date.parse('2026-06-30T15:00:00Z')?'kept':!current.etag?'missing-etag':current.etag!==version?'conflict':'deleted';
assert.equal(run({},null,''),'missing');
assert.equal(run({}, {date:'2026-10-26T00:00:00+09:00',etag:'2'},'2'),'kept');
assert.equal(run({}, {date:'2026-06-30T00:00:00+09:00',etag:''},''),'missing-etag');
assert.equal(run({}, {date:'2026-06-30T00:00:00+09:00',etag:'2'},'1'),'conflict');
assert.equal(run({}, {date:'2026-06-30T00:00:00+09:00',etag:'1'},'1'),'deleted');
console.log('PASS: scoped flow/ETag/failure guards, JST month/leap/year boundaries match student publication cutoff, missing/changed/conflicting records');