import * as React from 'react';
import { AppService, Criteria, Snapshot, emptyCriteria } from '../../types/model';
import { ModalState, Page, Run } from '../../types/navigation';
import { ClaimForm, Conditions, PrivateClaimForm, RequestForm } from './StudentForms';
import { Dialog, ItemInfo } from './StudentUi';
import { FoundSubmissionForm } from './FoundSubmissionForm';

const titleFor = (modal: ModalState): string => {
  if (modal.kind === 'item') return '拾得物の詳細';
  if (modal.kind === 'request') return modal.request ? '紛失した物を編集' : '紛失した物を登録';
  if (modal.kind === 'found') return '拾った物を登録';
  if (modal.kind === 'filters') return '検索条件';
  return '受け取りの申し込み';
};

export function StudentModal({ modal, data, service, criteria, draft, busy, error, run, showPageAfterAction, setCriteria, setDraft, setFiltersApplied, setModal, close }: {
  modal: ModalState;
  data: Snapshot;
  service: AppService;
  criteria: Criteria;
  draft: Criteria;
  busy: boolean;
  error: string;
  run: Run;
  showPageAfterAction: (page: Page) => void;
  setCriteria: (criteria: Criteria) => void;
  setDraft: (criteria: Criteria) => void;
  setFiltersApplied: (applied: boolean) => void;
  setModal: (modal: ModalState) => void;
  close: () => void;
}): React.ReactElement {
  return <Dialog title={titleFor(modal)} showTitle={modal.kind !== 'found'} className={modal.kind === 'filters' ? 'lf-search-dialog' : undefined} onClose={close} busy={busy}>
    {error && <div className="lf-error" role="alert">{error}</div>}
    <fieldset className="lf-content" disabled={busy}>
      {modal.kind === 'found' && <FoundSubmissionForm service={service} run={run} after={()=>{close();showPageAfterAction('found');}}/>}
      {modal.kind === 'item' && <><div className="lf-card-meta"><span>受付番号 #{modal.item.id}</span><span className="lf-badge">{modal.item.status}</span></div><h3>{modal.item.title}</h3><ItemInfo item={modal.item}/><p className="lf-muted">窓口で持ち主であることを確認します。</p><button className="lf-primary" onClick={() => setModal({ kind: 'claim', item: modal.item, requestId: modal.requestId })}>自分のものだと思う</button></>}
      {modal.kind === 'filters' && <form className="lf-form" onSubmit={event => { event.preventDefault(); setCriteria(draft); setFiltersApplied(true); close(); }}><p className="lf-muted">候補に自分の物がなければ、この検索条件で紛失した物を登録できます。</p><Conditions value={draft} onChange={setDraft}/><div className="lf-actions"><button type="button" onClick={() => setDraft(emptyCriteria())}>条件をクリア</button><button type="submit" className="lf-primary">この条件で探す</button></div></form>}
      {modal.kind === 'request' && <RequestForm request={modal.request} criteria={criteria} service={service} run={run} after={() => { close(); showPageAfterAction('requests'); }}/>}
      {modal.kind === 'claim' && <ClaimForm item={modal.item} requestId={modal.requestId} data={data} service={service} run={run} after={() => { close(); showPageAfterAction('requests'); }}/>}
      {modal.kind === 'private-claim' && <PrivateClaimForm request={modal.request} itemId={modal.itemId} window={modal.window} service={service} run={run} after={() => { close(); showPageAfterAction('requests'); }}/>}
    </fieldset>
  </Dialog>;
}
