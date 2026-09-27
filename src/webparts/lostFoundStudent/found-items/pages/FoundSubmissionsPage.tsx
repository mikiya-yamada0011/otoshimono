import * as React from 'react';
import { AppService, FoundSubmission, Snapshot } from '../types/model';
import { ModalState } from '../types/navigation';
import { Dialog, Empty, stamp } from '../components/student/StudentUi';
import { getCampus, getBuilding } from '../utils/locations';

export function FoundSubmissionsPage({data,service,setModal}:{data:Snapshot;service:AppService;setModal:(modal:ModalState)=>void}):React.ReactElement {
  const [submissions,setSubmissions]=React.useState<FoundSubmission[]>();
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState('');
  const [retry,setRetry]=React.useState(0);
  const [thanksId,setThanksId]=React.useState<string>();
  React.useEffect(()=>{
    let active=true;
    setLoading(true);
    setError('');
    service.loadFoundSubmissions()
      .then(rows=>{if(active)setSubmissions(rows);})
      .catch(cause=>{if(active)setError(String(cause.message || cause));})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[service,data,retry]);
  const thanks=submissions?.find(submission=>submission.id===thanksId && submission.status==='ACCEPTED' && submission.itemStatus==='返却済み');
  return <>
    <p className="lf-muted">自分が届けた物の履歴と、その後の状況を確認できます。</p>
    <div className="lf-actions lf-found-submissions-actions"><button className="lf-primary" disabled={loading || !!error} onClick={()=>setModal({kind:'found'})}>拾った物を登録</button></div>
    {error && <div className="lf-error" role="alert"><p>拾った物の届け出を読み込めませんでした。窓口に接続設定の確認を依頼してください。</p><small>{error}</small><button onClick={()=>setRetry(value=>value+1)}>再試行</button></div>}
    {loading && !submissions && <Empty title="読み込み中…"/>}
    <div className="lf-stack">{submissions?.map(submission=><article className="lf-panel" key={submission.id}>
      <div className="lf-card-meta"><strong>{submission.title}</strong><span className="lf-badge">{submission.status==='ACCEPTED'?(submission.itemStatus==='返却済み'?'持ち主に返却済み':submission.itemStatus==='保管中'?'保管中':submission.itemStatus==='移管済み'?'保管終了':'受領済み（状況確認中）'):submission.status==='REJECTED'?'受付できませんでした':submission.status==='PROCESSING'?'窓口で受付中':'窓口で確認待ち'}</span></div>
      <p>{submission.foundOn} · {[getCampus(submission.campus)?.name,getBuilding(submission.building)?.name,submission.place].filter(Boolean).join(' / ')}</p>
      {submission.status==='PENDING' && <p className="lf-muted">窓口で職員に届け出の確認を依頼してください。</p>}
      <p className="lf-muted">返却後のお礼メール：{submission.receiveReturnEmail?'受け取る':'受け取らない'}</p>
      {submission.window && <p>受付窓口：{submission.window}</p>}
      {submission.reason && <p>窓口から：{submission.reason}</p>}
      {submission.status==='ACCEPTED' && submission.itemStatus==='返却済み' && submission.returnedAt && <p>返却日時：{stamp(submission.returnedAt)}</p>}
      <small className="lf-muted">{stamp(submission.createdAt)}</small>
      {submission.status==='ACCEPTED' && submission.itemStatus==='返却済み' && <div className="lf-actions"><button type="button" onClick={()=>setThanksId(submission.id)}>お礼を見る</button></div>}
    </article>)}</div>
    {!loading && !error && submissions?.length===0 && <Empty title="届け出た物はまだありません"/>}
    {thanks && <Dialog title="届けてくださってありがとうございました" busy={false} onClose={()=>setThanksId(undefined)}>
      <p><strong>{thanks.title}</strong></p>
      <p className="lf-muted">届け出日時：{stamp(thanks.createdAt)}</p>
      {thanks.returnedAt && <p className="lf-muted">返却日時：{stamp(thanks.returnedAt)}</p>}
      <p>届けてくださった落とし物は、持ち主に返却できました。ご協力ありがとうございました。</p>
    </Dialog>}
  </>;
}
