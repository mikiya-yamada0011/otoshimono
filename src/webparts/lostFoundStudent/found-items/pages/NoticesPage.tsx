import * as React from 'react';
import { categoryName, Snapshot } from '../types/model';
import { ModalState } from '../types/navigation';
import { Empty, stamp } from '../components/student/StudentUi';

export function NoticesPage({ data, setModal, setError }: {
  data: Snapshot;
  setModal: (modal: ModalState) => void;
  setError: (message: string) => void;
}): React.ReactElement {
  const requestNotices = data.notices.filter(notice => notice.kind === 'MATCH' || notice.kind === 'VALUABLE')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id, undefined, {numeric: true}));
  return <><div className="lf-stack">{requestNotices.map(notice => {
    const claim = data.claims.find(candidate => (candidate.status === 'PENDING' || candidate.status === 'RETURNED') && candidate.requestId === notice.requestId);
    const otherClaim = data.claims.find(candidate => (candidate.status === 'PENDING' || candidate.status === 'RETURNED') && candidate.itemId === notice.itemId && candidate.requestId !== notice.requestId);
    const unavailable = notice.unavailable || (notice.kind === 'VALUABLE'
      ? data.claims.some(candidate => candidate.itemId === notice.itemId && candidate.status === 'UNAVAILABLE')
      : !data.items.some(item => item.id === notice.itemId));
    const request = data.requests.find(candidate => candidate.id === notice.requestId);
    const available = request?.status === 'ACTIVE' && !claim && !otherClaim && !unavailable;
    return <article className="lf-panel" key={notice.id}>
      <span className="lf-eyebrow">{stamp(notice.createdAt)}</span>
      <h3>{request ? `「${categoryName(request.criteria.parent, request.criteria.category)}」の候補が見つかりました` : '候補が見つかりました'}</h3>
      {request && <p className="lf-muted">紛失登録：{categoryName(request.criteria.parent, request.criteria.category)}（{stamp(request.createdAt)} 登録）</p>}
      <p>{unavailable ? '登録した内容に近い品物の案内です。' : <>登録した内容に近い品物が届いています。{notice.kind === 'VALUABLE' && '品物の詳細は窓口で確認してください。'}</>}</p>
      <p>受取窓口：{notice.window}</p>
      {claim ? <p><span className="lf-badge">{claim.status === 'RETURNED' ? '受け取り済み' : '受け取り予定'}</span></p> : otherClaim ? <p className="lf-muted">この候補は別の登録で{otherClaim.status === 'RETURNED' ? '受け取り済み' : '受け取り予定'}です。</p> : !available ? <p className="lf-muted">{unavailable ? 'この候補は現在受け取りできません。' : 'この登録は受付を終了しています。'}</p> : notice.kind === 'MATCH' ?
        <button onClick={() => { const item = data.items.find(candidate => candidate.id === notice.itemId); if (item) setModal({ kind: 'item', item, requestId: notice.requestId }); else setError('現在は保管中ではありません。窓口へ確認してください。'); }}>候補を確認</button> :
        request && <button onClick={() => setModal({kind: 'private-claim', request, itemId: notice.itemId, window: notice.window})}>候補を確認</button>}
    </article>;
  })}</div>{!requestNotices.length && <Empty title="新しいお知らせはありません"/>}</>;
}
