import * as React from 'react';
import { today } from '../../types/model';
import { Field } from './StudentUi';

export function CriteriaDates({ from, to, onFromChange, onToChange }: {
  from: string; to: string; onFromChange: (value: string) => void; onToChange: (value: string) => void;
}): React.ReactElement {
  const latest = today();
  return <div className="lf-criteria-dates">
    <div className="lf-date-input"><Field label="日付（開始）"><input type="date" max={to && to < latest ? to : latest} value={from} onChange={event => onFromChange(event.target.value)}/></Field></div>
    <div className="lf-date-input"><Field label="日付（終了）"><input type="date" min={from || undefined} max={latest} value={to} onChange={event => onToChange(event.target.value)}/></Field></div>
  </div>;
}
