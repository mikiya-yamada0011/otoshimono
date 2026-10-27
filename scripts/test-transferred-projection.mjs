import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTransferRecord,transferFields} from '../deployment/public-transfer.mjs';
const first='[移管 token-a 2026/10/20 12:30] 移管先：旧警察署／担当：private@example.invalid';
const second='[移管 token-b 2026/10/27 13:20] 移管先：灘警察署／担当：private@example.invalid';
assert.deepEqual(parseTransferRecord({Status:'移管済み',InternalNote:first+'\n[取消]\n'+second}),{TransferredAt:'2026/10/27',TransferDestination:'灘警察署'});
for(const note of ['', '自由記入のメモ', '[移管 token invalid]']) assert.deepEqual(parseTransferRecord({Status:'移管済み',InternalNote:note}),{TransferredAt:'',TransferDestination:''});
assert.deepEqual(parseTransferRecord({Status:'保管中',InternalNote:second}),{TransferredAt:'',TransferDestination:''});
assert(!JSON.stringify(parseTransferRecord({Status:'移管済み',InternalNote:second})).includes('private@'));
const schema=JSON.parse(readFileSync('deployment/list-schema.json','utf8'));
for(const field of ['TransferredAt','TransferDestination']) assert(schema.LFPublicItems.fields.some(f=>f.name===field));
const sync=JSON.parse(readFileSync('deployment/flows/PowerApps_即時公開同期.json','utf8')).properties.definition.actions.Public;
assert(sync.expression.includes("equals(body('Item')?['Status'],'移管済み')"));
for(const branch of [sync.actions.Exists.actions.UpdatePublic_Body,sync.actions.Exists.else.actions.CreatePublic_Body]) {
 assert.equal(branch.inputs.ItemStatus,"@body('Item')?['Status']");
 assert.deepEqual({TransferredAt:branch.inputs.TransferredAt,TransferDestination:branch.inputs.TransferDestination},transferFields());
 for(const forbidden of ['InternalNote','ReturnRecipientEmail','QrTag','Author','ReturnAudit']) assert(!(forbidden in branch.inputs));
}
const changed=JSON.parse(readFileSync('deployment/flows/PowerApps_新規登録時の条件照合.json','utf8')).properties.definition.actions;
assert(changed.SyncPublicProjection.expression.includes("equals(body('Item')?['Status'],'移管済み')"));
assert(!changed.NormalStored.expression.includes('移管済み'),'移管品を新着候補の自動照合に加えない');
console.log('移管公開：抽出・取消・公開範囲・生成フローの検査成功');
