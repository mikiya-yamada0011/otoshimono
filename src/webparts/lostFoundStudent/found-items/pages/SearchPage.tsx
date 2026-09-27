import * as React from 'react';
import { Criteria, Snapshot, categoryName, emptyCriteria, matches } from '../types/model';
import { getCampus } from '../utils/locations';
import { ModalState } from '../types/navigation';
import { ItemCard, Mark } from '../components/student/StudentUi';

export function SearchPage({ data, criteria, filtersApplied, setCriteria, setDraft, setFiltersApplied, setModal }: {
  data: Snapshot;
  criteria: Criteria;
  filtersApplied: boolean;
  setCriteria: (criteria: Criteria) => void;
  setDraft: (criteria: Criteria) => void;
  setFiltersApplied: (applied: boolean) => void;
  setModal: (modal: ModalState) => void;
}): React.ReactElement {
  const results = data.items.filter(item => matches(item, criteria));
  const conditionLabels = [criteria.query.trim(), criteria.parent && categoryName(criteria.parent, criteria.category), criteria.colors.join('・'), criteria.campuses.map(code => getCampus(code)?.name).filter(Boolean).join('・'), criteria.dateFrom && `${criteria.dateFrom}以降`, criteria.dateTo && `${criteria.dateTo}まで`].filter(Boolean);
  const hasCriteria = conditionLabels.length > 0;
  return <>
    <form className="lf-search-bar" onSubmit={event => event.preventDefault()}><input aria-label="キーワードで探す" placeholder="種類・色・特徴など" value={criteria.query} onChange={event => { setCriteria({ ...criteria, query: event.target.value }); setFiltersApplied(false); }}/><button type="button" className="lf-filter-button" onClick={() => { setDraft(criteria); setModal({ kind: 'filters' }); }}>絞り込み</button></form>
    <div className="lf-notification-prompt" role="region" aria-label="見つからない物の通知"><Mark type="notices"/><p>{filtersApplied && hasCriteria ? '候補に自分の物がなければ、この検索条件で紛失した物を登録し、通知を待てます。' : '絞り込み後、候補に自分の物がなければ、紛失した物を登録できます。'}</p>{filtersApplied && hasCriteria && <button type="button" onClick={() => setModal({ kind: 'request' })}>紛失した物を登録</button>}</div>
    {hasCriteria && <p className="lf-search-summary"><span>{conditionLabels.join(' ／ ')}</span><button className="lf-text-button" onClick={() => { setCriteria(emptyCriteria()); setFiltersApplied(false); }}>解除</button></p>}
    <div className="lf-section-heading"><h2>公開中の拾得物 <span>{results.length}件</span></h2><span>拾得日の新しい順</span></div>
    {results.length ? <div className="lf-item-grid">{results.sort((left, right) => right.foundOn.localeCompare(left.foundOn)).map(item => <ItemCard key={item.id} item={item} onOpen={() => setModal({ kind: 'item', item })}/>)}</div> : <section className="lf-search-empty"><p>{hasCriteria ? 'この条件に合う公開中の拾得物はありません。' : '現在、公開中の拾得物はありません。'}</p></section>}
  </>;
}
