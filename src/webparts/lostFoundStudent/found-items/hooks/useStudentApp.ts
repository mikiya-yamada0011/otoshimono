import * as React from 'react';
import { AppService, Criteria, Snapshot, emptyCriteria } from '../types/model';
import { ModalState, Page, Run } from '../types/navigation';
import { RefreshCoordinator } from '../utils/refreshCoordinator';

export interface StudentAppState {
  data?: Snapshot;
  page: Page;
  criteria: Criteria;
  draft: Criteria;
  filtersApplied: boolean;
  busy: boolean;
  error: string;
  message: string;
  modal?: ModalState;
  heading: React.RefObject<HTMLElement>;
  reload: () => Promise<void>;
  run: Run;
  navigate: (page: Page) => void;
  showPageAfterAction: (page: Page) => void;
  setCriteria: React.Dispatch<React.SetStateAction<Criteria>>;
  setDraft: React.Dispatch<React.SetStateAction<Criteria>>;
  setFiltersApplied: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setModal: React.Dispatch<React.SetStateAction<ModalState | undefined>>;
  closeModal: () => void;
}

export function useStudentApp(service: AppService): StudentAppState {
  const [data, setData] = React.useState<Snapshot>();
  const [page, setPage] = React.useState<Page>('search');
  const [criteria, setCriteria] = React.useState(emptyCriteria);
  const [draft, setDraft] = React.useState(emptyCriteria);
  const [filtersApplied, setFiltersApplied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [modal, setModal] = React.useState<ModalState>();
  const lock = React.useRef(false);
  const heading = React.useRef<HTMLElement>(null);

  const loader = React.useMemo(() => new RefreshCoordinator(() => service.load(), setData), [service]);
  const reload = React.useCallback(() => loader.refresh(), [loader]);

  React.useEffect(() => {
    let active = true;
    reload()
      .then(() => {
        if (!active) return;
        setPage(new URLSearchParams(window.location.search).has('lfNotice') ? 'notices' : 'search');
      })
      .catch(cause => {
        if (active) setError(String(cause.message || cause));
      });
    return () => { active = false; loader.invalidate(); };
  }, [loader, reload]);

  React.useEffect(() => {
    let active = true;
    const refresh = (): void => {
      if (document.visibilityState !== 'visible' || lock.current) return;
      if (!active) return;
      reload()
        .catch(() => { /* Explicit refresh reports connection errors. */ });
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);

  const run: Run = (work, success, after) => {
    if (lock.current) return;
    lock.current = true;
    loader.invalidate();
    setBusy(true);
    setError('');
    setMessage('');
    work()
      .then(async () => {
        await reload();
        setMessage(success);
        after?.();
      })
      .catch(async cause => {
        setError(String(cause.message || cause));
        try { await reload(); } catch { /* Retain input on connection failure. */ }
      })
      .finally(() => {
        lock.current = false;
        setBusy(false);
      });
  };

  const navigate = (nextPage: Page): void => {
    setPage(nextPage);
    setError('');
    setMessage('');
    window.setTimeout(() => {
      heading.current?.scrollTo(0, 0);
      heading.current?.focus();
    }, 0);
  };

  return {
    data, page, criteria, draft, filtersApplied, busy, error, message, modal, heading,
    reload, run, navigate, showPageAfterAction: setPage, setCriteria, setDraft, setFiltersApplied, setError, setModal,
    closeModal: () => setModal(undefined)
  };
}
