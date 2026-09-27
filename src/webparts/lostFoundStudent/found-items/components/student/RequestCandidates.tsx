import * as React from 'react';
import { Claim, Request } from '../../types/model';
import { ModalState } from '../../types/navigation';
import { LostCandidate } from '../../utils/lostRecords';

export function RequestCandidates({ candidates, request, claims, setModal }: {
  candidates: LostCandidate[];
  request: Request;
  claims: Claim[];
  setModal: (modal: ModalState) => void;
}): React.ReactElement {
  return <details className="lf-candidates">
    <summary>候補を見る（{candidates.length}件）</summary>
    <ul className="lf-candidate-list">{candidates.map(candidate => {
      const itemId = candidate.kind === 'public' ? candidate.item.id : candidate.itemId;
      const storageWindow = candidate.kind === 'public' ? candidate.item.window : candidate.window;
      const otherClaim = claims.find(claim => claim.itemId === itemId && claim.requestId !== request.id && (claim.status === 'PENDING' || claim.status === 'RETURNED'));
      return <li className="lf-candidate-row" key={itemId}>
        <div className="lf-candidate-info">
          <strong>{candidate.kind === 'public' ? candidate.item.title : '窓口からの案内'}</strong>
          {candidate.kind === 'public' ? <p>色：{candidate.item.colors.join('・') || '不明'}</p> : <p>品物は窓口で確認します。</p>}
          <p>受取窓口：{storageWindow}</p>
          {otherClaim && <p>別の登録で{otherClaim.status === 'RETURNED' ? '受け取り済み' : '受け取り予定'}です。</p>}
        </div>
        {candidate.kind === 'public'
          ? <button disabled={!!otherClaim} onClick={() => setModal({kind: 'item', item: candidate.item, requestId: request.id})}>詳細を見る</button>
          : <button disabled={!!otherClaim} onClick={() => setModal({kind: 'private-claim', request, itemId: candidate.itemId, window: candidate.window})}>案内を確認</button>}
      </li>;
    })}</ul>
  </details>;
}
