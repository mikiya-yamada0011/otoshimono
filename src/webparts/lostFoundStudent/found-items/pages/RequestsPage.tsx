import * as React from 'react';
import { AppService, Snapshot } from '../types/model';
import { ModalState, Run } from '../types/navigation';
import { Empty, RequestInfo, stamp } from '../components/student/StudentUi';
import { SwipeRegion } from '../components/student/SwipeRegion';
import { TransferInfo } from '../components/student/TransferInfo';
import { TrackingCard } from '../components/student/TrackingCard';
import { RequestCandidates } from '../components/student/RequestCandidates';
import { getBuilding, getCampus } from '../utils/locations';
import { lostRecords } from '../utils/lostRecords';

export function RequestsPage({ data, service, run, setModal, onSearch }: {
  data: Snapshot;
  service: AppService;
  run: Run;
  setModal: (modal: ModalState) => void;
  onSearch: () => void;
}): React.ReactElement {
  const [view, setView] = React.useState<'active' | 'completed'>('active');
  const records = lostRecords(data).filter(record =>
    view === 'completed' ? record.status === '受け取り済み' : record.status !== '受け取り済み');
  return <>
    <div className="lf-storage-tabs" role="group" aria-label="紛失した物の表示">
      <button className="lf-text-button" type="button" aria-pressed={view === 'active'} onClick={() => setView('active')}>対応中</button>
      <button className="lf-text-button" type="button" aria-pressed={view === 'completed'} onClick={() => setView('completed')}>終了分</button>
    </div>
    <SwipeRegion onNext={view==='active' ? () => setView('completed') : undefined} onPrevious={view==='completed' ? () => setView('active') : undefined}>
    <div className="lf-stack lf-record-list">
      {records.map(record => {
        const {request, claims} = record;
        const pending = claims.filter(claim => claim.status === 'PENDING' && !data.items.some(item=>item.id===claim.itemId && item.status==='移管済み'));
        const completed = record.status === '受け取り済み';
        const place = request && [request.criteria.campuses.map(code => getCampus(code)?.name).filter(Boolean).join('・'), getBuilding(request.criteria.building)?.name].filter(Boolean).join(' / ');
        const unfinished = pending.find(claim => !claim.requestId && data.items.some(item => item.id === claim.itemId));
        return <TrackingCard
          key={record.id}
          title={record.title}
          status={record.status}
          summary={claims.length
            ? claims.filter(claim => !completed || claim.status === 'RETURNED').map(claim => <React.Fragment key={claim.id}><p className="lf-record-line"><span>{data.items.some(item=>item.id===claim.itemId && item.status==='移管済み') ? '移管元' : '受取窓口'}</span>{claim.window}</p>{completed && <p className="lf-record-line"><span>受取日時</span>{stamp(claim.returnedAt || '')}</p>}</React.Fragment>)
            : request && <><p className="lf-record-line"><span>色</span>{request.criteria.colors.join('・') || '指定なし'}</p><p className="lf-record-line"><span>紛失場所</span>{place || '指定なし'}</p></>}
          details={<>
            {!!pending.length && <p className="lf-record-guidance">窓口で学校メールを伝え、本人確認後に受け取ってください。</p>}
            {request ? <RequestInfo request={request}/> : <p className="lf-record-line"><span>特徴</span>{claims[0]?.feature || '入力なし'}</p>}
          </>}
          date={completed ? undefined : record.date}
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
          {!completed && claims.map(claim=>{const item=data.items.find(candidate=>candidate.id===claim.itemId && candidate.status==='移管済み');return item ? <div key={claim.id}><p>申し込んだ品物は警察へ移管しました。</p><TransferInfo item={item}/></div> : null;})}
          {!completed && !pending.length && request && data.claims.some(claim => claim.requestId === request.id && claim.status === 'UNAVAILABLE') && <p className="lf-muted">申し込んだ候補は受け取りできなくなりました。引き続きほかの候補を探せます。</p>}
          {!completed && !pending.length && record.candidates.length > 0 && request && <RequestCandidates candidates={record.candidates} request={request} claims={data.claims} setModal={setModal}/>}
        </TrackingCard>;
      })}
    </div>
    {!records.length && <Empty title={view === 'active' ? "対応中の登録はありません" : "終了した登録はありません"}>{view==='active' && <button onClick={onSearch}>落とし物を探す</button>}</Empty>}
    </SwipeRegion>
  </>;
}
