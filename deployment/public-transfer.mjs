// The public projection exposes only the date/destination from the last transfer log.
// InternalNote and the operator email must never be copied to a public list.
export function transferFields() {
 const note="coalesce(body('Item')?['InternalNote'],'')";
 const tail=`last(split(${note},'[移管 '))`;
 const header=`first(split(${tail},']'))`;
 const valid=`and(equals(body('Item')?['Status'],'移管済み'),contains(${note},'[移管 '),contains(${tail},'] 移管先：'),contains(${tail},'／担当：'))`;
 return {
  TransferredAt:`@if(${valid},first(skip(split(${header},' '),1)),'')`,
  TransferDestination:`@if(${valid},trim(first(split(last(split(${tail},'] 移管先：')),'／担当：'))),'')`
 };
}
export function parseTransferRecord(item) {
 if(item.Status!=='移管済み') return {TransferredAt:'',TransferDestination:''};
 const tail=String(item.InternalNote || '').split('[移管 ').pop();
 const match=/^[^\s]+ (\d{4}\/\d{2}\/\d{2}) \d{2}:\d{2}\] 移管先：([^\r\n]*)／担当：/.exec(tail);
 return {TransferredAt:match?.[1] || '',TransferDestination:match?.[2]?.trim() || ''};
}
