import * as React from 'react';
import { Item, Request, Snapshot, studentIdFromEmail } from '../../types/model';
import { CATEGORY_GROUPS } from '../../utils/categories';
import { getBuilding, getCampus } from '../../utils/locations';

export const stamp = (value: string): string => value
  ? new Date(value).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

export function Mark({ type }: { type: string }): React.ReactElement {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    requests: <><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></>,
    claims: <><path d="m4 12 5 5L20 6M3 4h6M3 8h4"/></>,
    notices: <><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zM10 20h4"/></>,
    history: <><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2"/></>,
    found: <><path d="M12 20 3.5 11.5a5 5 0 0 1 7-7L12 6l1.5-1.5a5 5 0 0 1 7 7Z"/></>,
    settings: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></>
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type] || paths.search}</svg>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }): React.ReactElement {
  return <div className="lf-empty"><Mark type="search"/><h3>{title}</h3>{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }): React.ReactElement {
  return <label className="lf-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Dialog({ title, showTitle = true, className, onClose, busy, children }: { title: string; showTitle?: boolean; className?: string; onClose: () => void; busy: boolean; children: React.ReactNode }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const last = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = ref.current;
    element?.focus();
    const listener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) closeRef.current();
      if (event.key !== 'Tab' || !element) return;
      const all = Array.from(element.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'));
      const first = all[0];
      const end = all[all.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
        event.preventDefault();
        end?.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', listener);
      last?.focus();
    };
  }, [busy]);
  return <div className="lf-overlay"><div className={className ? `lf-dialog ${className}` : 'lf-dialog'} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><header className={showTitle ? undefined : 'lf-dialog-close-only'}>{showTitle && <h2>{title}</h2>}<button type="button" className="lf-icon-button" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button></header>{children}</div></div>;
}

export function ItemInfo({ item }: { item: Item }): React.ReactElement {
  return <dl className="lf-detail"><div><dt>色</dt><dd>{item.colors.join('・') || '不明'}</dd></div><div><dt>特徴</dt><dd>{item.feature || '登録なし'}</dd></div><div><dt>拾得場所</dt><dd>{item.place || getBuilding(item.building)?.name || getCampus(item.campus)?.name || '不明'}</dd></div><div><dt>拾得日</dt><dd>{item.foundOn || '不明'}</dd></div><div><dt>保管場所</dt><dd>{item.window}</dd></div></dl>;
}

export function RequestInfo({ request }: { request: Request }): React.ReactElement {
  const group = CATEGORY_GROUPS.find(candidate => candidate.code === request.criteria.parent);
  const category = group?.children.find(candidate => candidate.code === request.criteria.category);
  const place = getBuilding(request.criteria.building)?.name || request.criteria.campuses.map(code => getCampus(code)?.name).filter(Boolean).join('・') || '指定なし';
  const period = request.criteria.dateFrom && request.criteria.dateTo
    ? `${request.criteria.dateFrom} ～ ${request.criteria.dateTo}`
    : request.criteria.dateFrom ? `${request.criteria.dateFrom}以降` : request.criteria.dateTo ? `${request.criteria.dateTo}まで` : '指定なし';
  return <dl className="lf-request-details"><div><dt>種類</dt><dd>{group?.name || '指定なし'}</dd></div><div><dt>細かい種類</dt><dd>{category?.name || '指定なし'}</dd></div><div><dt>色</dt><dd>{request.criteria.colors.join('・') || '指定なし'}</dd></div><div><dt>キャンパス・場所</dt><dd>{place}</dd></div><div><dt>なくした時期</dt><dd>{period}</dd></div><div className="lf-request-feature"><dt>特徴</dt><dd>{request.feature || '入力なし'}</dd></div></dl>;
}

export function AccountInfo({ data }: { data: Snapshot }): React.ReactElement {
  return <section className="lf-panel"><h2>サインイン情報</h2><dl className="lf-detail"><div><dt>学籍番号</dt><dd>{studentIdFromEmail(data.user.email)}</dd></div><div><dt>学校メール</dt><dd>{data.user.email}</dd></div></dl><p className="lf-muted">大学のMicrosoft 365アカウントでサインインしています。サインインとパスワードは大学のMicrosoft 365で管理され、このアプリには保存されません。</p></section>;
}

export function ItemCard({ item, onOpen }: { item: Item; onOpen: () => void }): React.ReactElement {
  return <button type="button" className="lf-item-card" onClick={onOpen}><div className="lf-card-content"><h3>{item.title}</h3><p>色：{item.colors.join('・') || '不明'}</p><p className="lf-card-feature">特徴：{item.feature || '登録なし'}</p><div className="lf-card-footer"><span>保管場所：{item.window}</span><span>拾得日：{item.foundOn || '不明'}</span></div></div><span className="lf-chevron">›</span></button>;
}
