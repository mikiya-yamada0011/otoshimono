import assert from 'node:assert/strict';
import {SharePointRepository} from '../src/webparts/lostFoundStudent/found-items/api/repositories';
const site='https://example.sharepoint.com/teams/lost-found';
const photo=(Id:number,Slot:number,window='工学窓口')=>({Id,Slot,PhotoCount:1,Title:`${window}|2026-10-11|${Slot}`,StorageWindow:window,ReceivedOn:'2026-10-10T15:00:00Z',AttachmentFiles:[{FileName:`${Id}.webp`,ServerRelativeUrl:`/teams/lost-found/Lists/LFDailyPhotoBatches/Attachments/${Id}/${Id}.webp`}]});
async function read(pages:unknown[][],status=200,badNext=false) {
  let calls=0;
  const client={get:async(url:string)=>{
    assert(url.includes("getbytitle('LFDailyPhotoBatches')"));
    const value=pages[calls++]||[];
    return {ok:status===200,status,text:async()=>JSON.stringify({value,...(calls<pages.length?{'odata.nextLink':badNext?'https://outside.invalid/_api/photos':site+"/_api/web/lists/getbytitle('LFDailyPhotoBatches')/items?next="+calls}:{})})};
  }};
  return new SharePointRepository(client as never,site,{role:'student'} as never).list('photoBatches');
}
async function main() {
  const rows=await read([[photo(3,3),photo(8,1,'別窓口')],[photo(1,1),photo(2,2)]]);
  assert.equal(rows.length,2);
  assert.deepEqual((rows[0].value.photos as {name:string}[]).map(p=>p.name),['1.webp','2.webp','3.webp']);
  assert.equal(rows[0].value.receivedOn,'2026-10-11');
  const incomplete={...photo(9,1),AttachmentFiles:[]};
  assert.deepEqual(await read([[{...photo(1,1),PhotoCount:0}]]),[],'An uploaded photo is not public until native upload completion is confirmed');
  assert.deepEqual(await read([[incomplete]]),[],'In-flight or failed uploads never produce empty cards');
  assert.equal(((await read([[incomplete,photo(2,2)]]))[0].value.photos as unknown[]).length,1);
  for(const raw of [
    {...photo(1,1),Slot:4}, {...photo(1,1),Title:'legacy'},
    {...photo(1,1),AttachmentFiles:[...photo(1,1).AttachmentFiles,...photo(1,1).AttachmentFiles]},
    {...photo(1,1),AttachmentFiles:[{FileName:'x.webp',ServerRelativeUrl:'https://outside.invalid/x.webp'}]},
    {...photo(1,1),AttachmentFiles:photo(2,2).AttachmentFiles},
  ]) assert.deepEqual((await read([[raw]]))[0].value,{invalid:true});
  assert.deepEqual((await read([[photo(1,1),photo(2,1)]]))[0].value,{invalid:true});
  await assert.rejects(read([[photo(1,1)],[photo(1,1)]]));
  await assert.rejects(read([[photo(1,1)],[]],200,true));
  for(const status of [403,404,500]) await assert.rejects(read([[]],status));
  console.log('PASS: three independent slots, grouping across pages, stable order, incomplete upload exclusion, duplicate/foreign image rejection and read failures');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
