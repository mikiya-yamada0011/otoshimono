import * as React from 'react';
import { AppService, Snapshot } from '../types/model';
import { ModalState, Run } from '../types/navigation';
import { Empty, RequestInfo } from '../components/student/StudentUi';
import { TrackingCard } from '../components/student/TrackingCard';
import { RequestCandidates } from '../components/student/RequestCandidates';
import { getBuilding, getCampus } from '../utils/locations';
import { lostRecords } from '../utils/lostRecords';

export function RequestsPage({ data, service, run, setModal, startNewRequest }: {
  data: Snapshot;
  service: AppService;
  run: Run;
  setModal: (modal: ModalState) => void;
  startNewRequest: () => void;
}): React.ReactElement {
  const records = lostRecords(data);
  return <>
    <div className="lf-page-actions"><button className="lf-primary" onClick={startNewRequest}>紛失した物を登録</button></div>
    <div className="lf-stack lf-record-list">
      {records.map(record => {
        const {request, claims} = record;
        const pending = claims.filter(claim => claim.status === 'PENDING');
        const completed = record.status === '受け取り済み';
        const place = request && [request.criteria.campuses.map(code => getCampus(code)?.name).filter(Boolean).join('・'), getBuilding(request.criteria.building)?.name].filter(Boolean).join(' / ');
        const unfinished = pending.find(claim => !claim.requestId && data.items.some(item => item.id === claim.itemId));
        return <TrackingCard
          key={record.id}
          title={record.title}
          status={record.status}
          summary={claims.length
            ? claims.map(claim => <p className="lf-record-line" key={claim.id}><span>受取窓口</span>{claim.window}</p>)
            : request && <><p className="lf-record-line"><span>色</span>{request.criteria.colors.join('・') || '指定なし'}</p><p className="lf-record-line"><span>紛失場所</span>{place || '指定なし'}</p></>}
          details={<>
            {!!pending.length && <p className="lf-record-guidance">窓口で学校メールを伝え、本人確認後に受け取ってください。</p>}
            {request ? <RequestInfo request={request}/> : <p className="lf-record-line"><span>特徴</span>{claims[0]?.feature || '入力なし'}</p>}
          </>}
          date={record.date}
          actions={!completed && <>
            {unfinished && <button onClick={() => run(() => service.createClaim(unfinished.itemId, unfinished.feature), '登録を完了しました。')}>登録を完了する</button>}
            {!!pending.length && <button onClick={() => {
              if (window.confirm(request ? '受け取りをキャンセルしますか？紛失登録は残り、ほかの候補を探せます。' : '受け取りをキャンセルしますか？')) run(async () => {
                for (const claim of pending) await service.cancelClaim(claim.id);
              }, request ? '受け取りをキャンセルしました。紛失登録は残っています。' : '受け取りをキャンセルしました。');
            }}>受け取りをキャンセル</button>}
            {!pending.length && request && <button onClick={() => setModal({kind: 'request', request})}>編集</button>}
            {!pending.length && request && <button onClick={() => {
              if (window.confirm('この登録を削除しますか？候補の通知も止まります。')) run(() => service.cancelRequest(request.id), '登録を削除しました。');
            }}>登録を削除</button>}
          </>}
        >
          {!completed && !pending.length && request && data.claims.some(claim => claim.requestId === request.id && claim.status === 'UNAVAILABLE') && <p className="lf-muted">申し込んだ候補は受け取りできなくなりました。引き続きほかの候補を探せます。</p>}
          {record.status === '候補あり' && request && <RequestCandidates candidates={record.candidates} request={request} claims={data.claims} setModal={setModal}/>}
        </TrackingCard>;
      })}
    </div>
    {!records.length && <Empty title="紛失した物の登録はありません"/>}
  </>;
}
