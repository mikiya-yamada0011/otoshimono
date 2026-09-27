export const FINDER_RETURN_SUBJECT='届けてくださってありがとうございました';
export const FINDER_RETURN_MESSAGE='届けてくださった落とし物は、持ち主に返却できました。ご協力ありがとうございました。';

// Reflect only the finder-safe result onto the original, author-scoped intake
// row. The inventory backlink, not a caller-supplied ItemId, is authoritative.
// A periodic run also repairs older returns and return cancellations.
export function finderSubmissionHistory(Steps,path,config) {
  const rows=new Steps().items('FinderHistorySubmissions','LFFoundSubmissions',"ReviewStatus eq 'ACCEPTED'");
  const sync=new Steps().http('FinderHistoryCurrent',path('LFFoundSubmissions')+"(@{items('EachFinderHistory')?['ID']})")
    .http('FinderHistoryItems',path(config.foundItemsList)+"?$filter=StudentSubmissionKey eq '@{body('FinderHistoryCurrent')?['Id']}'&$top=2");
  const item="first(body('FinderHistoryItems')?['value'])";
  const trusted=`@and(equals(body('FinderHistoryCurrent')?['ReviewStatus'],'ACCEPTED'),equals(length(body('FinderHistoryItems')?['value']),1),equals(body('FinderHistoryCurrent')?['ItemId'],string(${item}?['Id'])),contains(createArray('保管中','返却済み','移管済み'),${item}?['Status']))`;
  const result={ItemStatus:`@${item}?['Status']`,ReturnedAt:`@if(equals(${item}?['Status'],'返却済み'),${item}?['ReturnedAt'],null)`};
  const changed=`@or(not(equals(coalesce(body('FinderHistoryCurrent')?['ItemStatus'],''),${item}?['Status'])),not(equals(coalesce(body('FinderHistoryCurrent')?['ReturnedAt'],''),if(equals(${item}?['Status'],'返却済み'),coalesce(${item}?['ReturnedAt'],''),''))))`;
  const update=new Steps().condition('FinderHistoryChanged',changed,new Steps().http('FinderHistoryUpdate',path('LFFoundSubmissions')+"(@{body('FinderHistoryCurrent')?['Id']})",result,{'X-HTTP-Method':'MERGE','IF-MATCH':"@body('FinderHistoryCurrent')?['odata.etag']"}));
  sync.condition('FinderHistoryTrusted',trusted,update);
  return rows.each('EachFinderHistory',"@body('FinderHistorySubmissions')?['value']",sync);
}

// Student submissions always use their original Author, even when FinderEmail
// differs. Only a staff-registered item without a submission uses FinderEmail.
export function finderReturnThanks(Steps,path,config) {
  const item="body('FinderReturnedItem')";
  const key=`@concat('FINDER_RETURN:',string(${item}?['Id']),':',coalesce(${item}?['StudentSubmissionKey'],''))`;
  const school=email=>`and(equals(length(split(${email},'@')),2),or(${Array.from({length:10},(_,digit)=>`contains(first(split(${email},'@')),'${digit}')`).join(',')}),contains(createArray(${config.schoolEmailDomains.map(domain=>`'${domain.replaceAll("'","''")}'`).join(',')}),last(split(${email},'@'))))`;
  const queue=(prefix,email)=>{
    const steps=new Steps().compose(prefix+'Key',key).http(prefix+'Queue',path('LFMailOutbox')+`?$filter=Title eq '@{outputs('${prefix}Key')}'&$top=1`);
    return steps.condition(prefix+'Missing',`@empty(body('${prefix}Queue')?['value'])`,new Steps().http(prefix+'CreateMail',path('LFMailOutbox'),{
      Title:`@outputs('${prefix}Key')`,NotificationKey:`@outputs('${prefix}Key')`,RecipientEmail:'@'+email,
      MailSubject:FINDER_RETURN_SUBJECT,MailBody:FINDER_RETURN_MESSAGE,MailStatus:'PENDING',ErrorMessage:''
    }));
  };
  const author="toLower(coalesce(body('FinderReturnSubmission')?['Author']?['EMail'],''))";
  const submission=new Steps().http('FinderReturnSubmission',path('LFFoundSubmissions')+`(@{int(${item}?['StudentSubmissionKey'])})?$select=Id,AuthorId,ReceiveReturnEmail,Author/EMail&$expand=Author`);
  submission.condition('FinderReturnAuthenticatedFinder',`@and(equals(body('FinderReturnSubmission')?['ReceiveReturnEmail'],true),greater(coalesce(body('FinderReturnSubmission')?['AuthorId'],0),0),${school(author)})`,queue('FinderReturn',author));
  const staffEmail=`toLower(trim(coalesce(${item}?['FinderEmail'],'')))`;
  const staff=new Steps().condition('StaffFinderReturnEmailValid','@'+school(staffEmail),queue('StaffFinderReturn',staffEmail));
  const origin=new Steps().condition('FinderReturnStudentSubmission',`@not(empty(${item}?['StudentSubmissionKey']))`,submission,staff);
  return new Steps().condition('FinderReturnHasFinder',`@and(equals(${item}?['Status'],'返却済み'),or(not(empty(${item}?['StudentSubmissionKey'])),not(empty(${item}?['FinderEmail']))))`,origin);
}
