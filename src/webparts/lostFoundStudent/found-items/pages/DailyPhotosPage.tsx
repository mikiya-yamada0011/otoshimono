import { campusDay, isPhotoPublished, nextCampusMidnight } from "../utils/photoRetention";
import * as React from 'react';
import { AppService, DailyPhotoBatch } from '../types/model';
import { SwipeRegion } from '../components/student/SwipeRegion';
import { Dialog, Empty } from '../components/student/StudentUi';

export function DailyPhotosPage({service, onPrevious}: {service: AppService; onPrevious?: () => void}): React.ReactElement {
  const [batches, setBatches] = React.useState<DailyPhotoBatch[]>();
  const [publicationDay, setPublicationDay] = React.useState(() => campusDay());
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = (): void => {
      setPublicationDay(campusDay());
      timer = setTimeout(tick, Math.max(1000, nextCampusMidnight() - Date.now() + 100));
    };
    const resume = (): void => { clearTimeout(timer); tick(); };
    tick();
    document.addEventListener('visibilitychange', resume);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, []);
  const [error, setError] = React.useState('');
  const [retry, setRetry] = React.useState(0);
  const [window, setWindow] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [selected, setSelected] = React.useState<{batch: DailyPhotoBatch; index: number}>();
  React.useEffect(() => {
    let active = true;
    setError('');
    service.loadDailyPhotoBatches().then(rows => {if (active) setBatches(rows);})
      .catch(cause => {if (active) setError(String(cause.message || cause));});
    return () => {active = false;};
  }, [service, retry]);
  const published = batches?.filter(batch => isPhotoPublished(batch.receivedOn, new Date(`${publicationDay}T12:00:00+09:00`)));
  React.useEffect(() => {
    if (selected && !isPhotoPublished(selected.batch.receivedOn, new Date(`${publicationDay}T12:00:00+09:00`))) setSelected(undefined);
  }, [publicationDay, selected]);
  const windows = Array.from(new Set(published?.map(batch => batch.window) || [])).sort((a,b) => a.localeCompare(b,'ja'));
  const invalidRange = !!from && !!to && from > to;
  const results = published?.filter(batch => (!window || batch.window === window)
    && (!from || batch.receivedOn >= from) && (!to || batch.receivedOn <= to));
  const batchesByDay = new Map<string, DailyPhotoBatch[]>();
  results?.forEach(batch => {
    const day = batchesByDay.get(batch.receivedOn);
    if (day) day.push(batch);
    else batchesByDay.set(batch.receivedOn, [batch]);
  });
  const days = Array.from(batchesByDay.entries()).sort(([a], [b]) => b.localeCompare(a));
  return <>
    <div className="lf-photo-filters">
      <label>掲載窓口<select aria-label="掲載窓口" value={window} onChange={event => setWindow(event.target.value)}><option value="">すべての窓口</option>{windows.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>受付日（開始）<input type="date" value={from} onChange={event => setFrom(event.target.value)}/></label>
      <label>受付日（終了）<input type="date" value={to} onChange={event => setTo(event.target.value)}/></label>
    </div>
    <SwipeRegion onPrevious={onPrevious}>
    {invalidRange && <p className="lf-error" role="alert">受付日の開始は終了以前にしてください。</p>}
    {error && <div className="lf-error" role="alert"><p>拾得物の写真を読み込めませんでした。</p><small>{error}</small><button type="button" onClick={() => setRetry(value => value + 1)}>再試行</button></div>}
    {!batches && !error && <Empty title="拾得物の写真を読み込み中…"/>}
    {batches && !invalidRange && <>
      <div className="lf-section-heading"><h2>拾得物の写真 <span>{results?.length}件</span></h2><span>受付日の新しい順</span></div>
      <div className="lf-stack">{days.map(([receivedOn, dayBatches]) => <article className="lf-panel lf-daily-photo-day" key={receivedOn}>
        <h3>{receivedOn.replace(/-/g, '/')} 受付</h3>
        {dayBatches.map(batch => <section className="lf-daily-photo-window" key={batch.id} aria-label={`${batch.window}の写真`}>
          <h4>掲載窓口：{batch.window}</h4>
          <div className="lf-daily-photo-grid">{batch.photos.map((photo, index) => <button type="button" className="lf-photo-open" key={photo.url}
            aria-label={`${batch.window}・${receivedOn}受付の写真${index + 1}を拡大`} onClick={() => setSelected({batch,index})}>
            <img src={photo.url} loading="lazy" alt={`${batch.window}に届いた物の写真${index + 1}`}/>
            <span>写真{index + 1}を拡大</span>
          </button>)}</div>
        </section>)}
      </article>)}</div>
      {!error && !results?.length && <Empty title={published?.length ? 'この条件の写真はありません' : '現在、掲載中の写真はありません'}/>}
    </>}
    </SwipeRegion>
    {selected && isPhotoPublished(selected.batch.receivedOn, new Date(`${publicationDay}T12:00:00+09:00`)) && <Dialog title={`${selected.batch.receivedOn.replace(/-/g, '/')} 受付の写真`} busy={false} onClose={() => setSelected(undefined)}>
      <p>掲載窓口：{selected.batch.window}</p>
      <img className="lf-photo-expanded" src={selected.batch.photos[selected.index].url} alt={`届いた物の写真${selected.index + 1}`}/>
      <p>自分の物と思われる場合は、掲載窓口で確認してください。</p>
    </Dialog>}
  </>;
}
