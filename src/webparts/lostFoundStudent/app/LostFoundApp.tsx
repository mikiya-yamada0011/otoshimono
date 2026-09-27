import * as React from 'react';
import { AppService, emptyCriteria } from '../found-items/types/model';
import { StudentModal } from '../found-items/components/student/StudentModal';
import { AccountInfo, Empty, Mark } from '../found-items/components/student/StudentUi';
import { useStudentApp } from '../found-items/hooks/useStudentApp';
import { HistoryPage } from '../found-items/pages/HistoryPage';
import { NoticesPage } from '../found-items/pages/NoticesPage';
import { RequestsPage } from '../found-items/pages/RequestsPage';
import { SearchPage } from '../found-items/pages/SearchPage';
import { FoundSubmissionsPage } from '../found-items/pages/FoundSubmissionsPage';
import { BOTTOM_PAGES, PAGE_LABELS, Page } from '../found-items/types/navigation';
import '../styles/tailwind.generated.global.scss';

export default function LostFoundApp({ service }: { service: AppService }): React.ReactElement {
  const app = useStudentApp(service);

  const startNewRequest = (): void => {
    app.setDraft(emptyCriteria());
    app.setFiltersApplied(false);
    app.navigate('search');
    app.setModal({ kind: 'filters' });
  };

  const pages: Record<Page, React.ReactNode> | undefined = app.data ? {
    search: <SearchPage data={app.data} criteria={app.criteria} filtersApplied={app.filtersApplied} setCriteria={app.setCriteria} setDraft={app.setDraft} setFiltersApplied={app.setFiltersApplied} setModal={app.setModal}/>,
    requests: <RequestsPage data={app.data} service={service} run={app.run} setModal={app.setModal} startNewRequest={startNewRequest}/>,
    notices: <NoticesPage data={app.data} showPageAfterAction={app.showPageAfterAction} setModal={app.setModal} setError={app.setError}/>,
    history: <HistoryPage data={app.data}/>,
    found: <FoundSubmissionsPage data={app.data} service={service} setModal={app.setModal}/>,
    settings: <AccountInfo data={app.data}/>
  } : undefined;

  const content = pages
    ? pages[app.page]
    : <Empty title={app.error ? '読み込めませんでした' : '読み込み中…'}>{app.error && <button onClick={() => app.run(app.reload, '再読込しました。')}>再試行</button>}</Empty>;

  return <div className="lf-app lf-student">
    <div className="lf-main">
      <header className="lf-topbar">
        <div className="lf-brand"><span className="lf-logo">L</span><strong>Lost & Found<small>大学の落とし物</small></strong></div>
        <div className="lf-top-actions"><button onClick={()=>app.navigate('found')}>拾った物</button><button className="lf-icon-button" aria-label="利用者設定" onClick={() => app.navigate('settings')}><Mark type="settings"/></button></div>
      </header>
      <main ref={app.heading} tabIndex={-1} aria-label={PAGE_LABELS[app.page]}>
        {!!app.data?.warnings?.length && <div className="lf-error" role="alert">一部の保存データの形式を確認できません。職員に修正を依頼してください（{app.data.warnings.join('、')}）。</div>}
        {!app.modal && app.error && <div className="lf-error" role="alert">{app.error}</div>}
        {app.message && <div className="lf-success" role="status">{app.message}</div>}
        {app.busy && <div className="lf-loading" role="status">保存・更新しています…</div>}
        <fieldset className="lf-content" disabled={app.busy}>{content}</fieldset>
      </main>
      <nav className="lf-bottom-nav" aria-label="学生メニュー">{BOTTOM_PAGES.map(page => <button key={page} aria-current={app.page === page ? 'page' : undefined} onClick={() => app.navigate(page)}><Mark type={page}/><span>{page === 'search' ? '探す' : PAGE_LABELS[page]}</span></button>)}</nav>
    </div>
    {app.modal && app.data && <StudentModal
      modal={app.modal}
      data={app.data}
      service={service}
      criteria={app.criteria}
      draft={app.draft}
      busy={app.busy}
      error={app.error}
      run={app.run}
      showPageAfterAction={app.showPageAfterAction}
      setCriteria={app.setCriteria}
      setDraft={app.setDraft}
      setFiltersApplied={app.setFiltersApplied}
      setModal={app.setModal}
      close={() => { app.setError(''); app.closeModal(); }}
    />}
  </div>;
}
