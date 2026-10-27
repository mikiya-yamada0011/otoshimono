import assert from 'node:assert/strict';
import {photoPublicationEndsOn,isPhotoPublished,photoPublicStart,photoPublicCutoffInstant,campusDay,nextCampusMidnight} from '../src/webparts/lostFoundStudent/found-items/utils/photoRetention';
import {SharePointRepository} from '../src/webparts/lostFoundStudent/found-items/api/repositories';
import {StudentService,Repository} from '../src/webparts/lostFoundStudent/found-items/api/service';
const before=new Date('2026-09-30T14:59:59Z'), after=new Date('2026-09-30T15:00:00Z');
assert.equal(campusDay(before),'2026-09-30');assert.equal(campusDay(after),'2026-10-01');
for(const day of ['2026-06-01','2026-06-30']) {
 assert.equal(photoPublicationEndsOn(day),'2026-10-01');
 assert.equal(isPhotoPublished(day,before),true);assert.equal(isPhotoPublished(day,after),false);
}
assert.equal(isPhotoPublished('2026-07-01',after),true);
assert.equal(photoPublicationEndsOn('2026-01-31'),'2026-05-01');
assert.equal(photoPublicationEndsOn('2024-02-29'),'2024-06-01');
assert.equal(photoPublicationEndsOn('2026-12-31'),'2027-04-01');
for(const day of ['','2026-02-29','2026-06-31','2026-6-01','bad']) assert.equal(photoPublicationEndsOn(day),undefined);
assert.equal(isPhotoPublished('2026-10-02',after),false,'Future receipts are not published');
assert.equal(photoPublicStart(after),'2026-07-01');assert.equal(photoPublicCutoffInstant(after),'2026-06-30T15:00:00.000Z');
assert.equal(nextCampusMidnight(before),after.valueOf());
const zone=process.env.TZ;process.env.TZ='America/Los_Angeles';
assert.equal(isPhotoPublished('2026-06-30',after),false);process.env.TZ=zone;
const photo=(Id:number,day:string)=>({Id,Slot:1,PhotoCount:1,Title:`窓口|${day}|1`,StorageWindow:'窓口',ReceivedOn:`${day}T00:00:00+09:00`,AttachmentFiles:[{FileName:'test.webp',ServerRelativeUrl:`/teams/test/Lists/LFDailyPhotoBatches/Attachments/${Id}/test.webp`}]});
async function main() {
 let calls=0;
 const client={get:async(url:string)=>{calls++;assert(url.includes("ReceivedOn ge datetime'2026-06-30T15:00:00.000Z'"));return {ok:true,status:200,text:async()=>JSON.stringify({value:[photo(1,'2026-06-30'),photo(2,'2026-07-01')]})};}};
 const user={id:'s',email:'123@stu.kobe-u.ac.jp',role:'student'};
 const repo=new SharePointRepository(client as never,'https://example.sharepoint.com/teams/test',user as never,()=>after);
 assert.deepEqual((await repo.list('photoBatches')).map(r=>r.id),['2'],'Expired rows are excluded even if a server returns them');
 assert.equal(calls,1);
 const raw={list:async()=>['2026-06-30','2026-07-01'].map((day,i)=>({id:String(i+1),value:{window:'窓口',receivedOn:day,photos:[{name:'photo',url:'https://example.invalid/p.webp'}]}}))} as unknown as Repository;
 const service=new StudentService(raw,undefined,undefined,()=>after);
 assert.deepEqual((await service.loadDailyPhotoBatches()).map(r=>r.id),['2'],'Service also excludes expired photos from a cached repository');
 console.log('PASS: monthly publication boundaries, month-end/leap/year rollover, campus timezone, server filter and stale-cache exclusion');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
