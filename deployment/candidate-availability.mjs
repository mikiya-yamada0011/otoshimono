// End an invitation without deleting its history or exposing private item data.
// Re-read both rows and use the notice ETag: delayed return events must not
// invalidate a new staff invitation after the item has been restored.
export function retireCandidates(Steps,path,config) {
  const retire=new Steps()
    .http('CandidateCurrentItem',path(config.foundItemsList)+"(@{body('Item')?['Id']})")
    .http('CandidateCurrentNotice',path('LFNotices')+"(@{items('EachCandidateNotice')?['ID']})");
  retire.condition('CandidateStillEnded',"@and(or(equals(body('CandidateCurrentItem')?['Status'],'返却済み'),equals(body('CandidateCurrentItem')?['Status'],'移管済み')),equals(body('CandidateCurrentNotice')?['ItemId'],string(body('CandidateCurrentItem')?['Id'])),not(equals(body('CandidateCurrentNotice')?['CandidateUnavailable'],true)))",
    new Steps().http('RetireCandidate',path('LFNotices')+"(@{body('CandidateCurrentNotice')?['Id']})",{CandidateUnavailable:true},{'X-HTTP-Method':'MERGE','IF-MATCH':"@body('CandidateCurrentNotice')?['odata.etag']"}));
  return new Steps().condition('CandidateItemEnded',"@or(equals(body('Item')?['Status'],'返却済み'),equals(body('Item')?['Status'],'移管済み'))",
    new Steps().items('CandidateNotices','LFNotices',"ItemId eq '@{body('Item')?['Id']}' and NoticeKind eq 'VALUABLE'")
      .each('EachCandidateNotice',"@body('CandidateNotices')?['value']",retire));
}
