import * as React from 'react';
import { Snapshot } from '../types/model';
import { Empty, stamp } from '../components/student/StudentUi';

export function HistoryPage({ data }: { data: Snapshot }): React.ReactElement {
  const returnedClaims = data.claims.filter(claim => claim.status === 'RETURNED');
  return <><div className="lf-stack">{returnedClaims.map(claim => <article className="lf-panel" key={claim.id}><span className="lf-badge">受取済み</span><h3>{claim.title}</h3><p>{claim.window} · {stamp(claim.returnedAt)}</p></article>)}</div>{!returnedClaims.length && <Empty title="返却履歴はまだありません"/>}</>;
}
