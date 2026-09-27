import * as React from 'react';
import { stamp } from './StudentUi';

export function TrackingCard({ title, status, summary, details, date, actions, children }: {
  title: string;
  status: string;
  summary: React.ReactNode;
  details: React.ReactNode;
  date: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement {
  return <article className="lf-panel lf-record-card">
    <header className="lf-record-header"><h3>{title}</h3><span className="lf-badge">{status}</span></header>
    <div className="lf-record-summary">{summary}</div>
    <details className="lf-record-details"><summary>詳細を見る</summary>{details}</details>
    {children}
    <footer className="lf-record-footer">
      <span className="lf-muted">{stamp(date)}</span>
      <div className="lf-record-actions">{actions}</div>
    </footer>
  </article>;
}
