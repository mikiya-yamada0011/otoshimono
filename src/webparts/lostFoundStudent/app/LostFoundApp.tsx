import * as React from 'react';
import { AppService, Snapshot, Criteria, Item, Request, COLORS, emptyCriteria, today, categoryName, matches, studentIdFromEmail } from './model';
import { CATEGORY_GROUPS } from '../found-items/utils/categories';
import { CAMPUSES, getCampus, getBuilding } from '../found-items/utils/locations';
import './app.scss';

type Page = 'search'|'requests'|'claims'|'notices'|'history'|'thanks'|'settings';
type ModalState = {kind:'item';item:Item;requestId?:string} | {kind:'request';request?:Request} | {kind:'claim';item:Item;requestId?:string} | {kind:'thanks';claimId:string} | {kind:'filters'};
const stamp=(s:string):string=>s?new Date(s).toLocaleString('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const labels:Record<Page,string>={search:'落とし物を探す',requests:'紛失申告',claims:'受け取り予定',notices:'お知らせ',history:'返却履歴',thanks:'ありがとう',settings:'利用者設定'};
function Mark({type}:{type:string}):React.ReactElement {
  const paths:Record<string,React.ReactNode>={search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,requests:<><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></>,claims:<><path d="m4 12 5 5L20 6M3 4h6M3 8h4"/></>,notices:<><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zM10 20h4"/></>,history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2"/></>,thanks:<path d="M12 20 3 11C-1 4 8 0 12 7c4-7 13-3 9 4z"/>,settings:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></>,inventory:<><path d="m3 7 9-4 9 4v13H3zM3 7h18M9 11h6"/></>,register:<path d="M12 3v18M3 12h18"/>};
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type] || paths.search}</svg>;
}
function Empty({title,children}:{title:string;children?:React.ReactNode}):React.ReactElement{return <div className="lf-empty"><Mark type="search"/><h3>{title}</h3>{children}</div>;}
function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}):React.ReactElement{return <label className="lf-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
function Colors({value,onChange}:{value:string[];onChange:(colors:string[])=>void}):React.ReactElement{
  return <fieldset className="lf-colors"><legend>色 <small>複数選択・どれか1色が合えば一致</small></legend><div>{COLORS.map(color=><button type="button" key={color} aria-pressed={value.includes(color)} onClick={()=>onChange(value.includes(color)?value.filter(c=>c!==color):[...value,color])}>{color}</button>)}</div></fieldset>;
}
function Conditions({value,onChange,dates=true,requireCategory=false}:{value:Criteria;onChange:(c:Criteria)=>void;dates?:boolean;requireCategory?:boolean}):React.ReactElement{
  const group=CATEGORY_GROUPS.find(g=>g.code===value.parent);
  return <div className="lf-fields">
    <div className="lf-grid2"><Field label="種類"><select required={requireCategory} value={value.parent} onChange={e=>onChange({...value,parent:e.target.value,category:''})}><option value="">{requireCategory?'選択してください':'すべての種類'}</option>{CATEGORY_GROUPS.map(g=><option key={g.code} value={g.code}>{g.name}</option>)}</select></Field>
    <Field label="細かい種類"><select value={value.category} disabled={!group} onChange={e=>onChange({...value,category:e.target.value})}><option value="">指定なし</option>{group?.children.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field></div>
    <Colors value={value.colors} onChange={colors=>onChange({...value,colors})}/>
    <Field label="キャンパス"><select value={value.campus} onChange={e=>onChange({...value,campus:e.target.value,building:''})}><option value="">指定なし</option>{CAMPUSES.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
    {dates&&<div className="lf-grid2"><Field label="日付（開始）"><input type="date" value={value.dateFrom} max={value.dateTo || today()} onChange={e=>onChange({...value,dateFrom:e.target.value})}/></Field><Field label="日付（終了）"><input type="date" value={value.dateTo} min={value.dateFrom} max={today()} onChange={e=>onChange({...value,dateTo:e.target.value})}/></Field></div>}
  </div>;
}
function Modal({title,onClose,busy,children}:{title:string;onClose:()=>void;busy:boolean;children:React.ReactNode}):React.ReactElement {
  const ref=React.useRef<HTMLDivElement>(null); const closeRef=React.useRef(onClose);closeRef.current=onClose;
  React.useEffect(()=>{const last=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;document.body.style.overflow="hidden";const el=ref.current;el?.focus();const listener=(e:KeyboardEvent):void=>{if(e.key==='Escape'&&!busy)closeRef.current();if(e.key==='Tab'&&el){const all=Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'));const first=all[0],end=all[all.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===el)){e.preventDefault();end?.focus();}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',listener);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',listener);last?.focus();};},[busy]);
  return <div className="lf-overlay"><div className="lf-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><header><h2>{title}</h2><button type="button" className="lf-icon-button" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button></header>{children}</div></div>;
}
function ItemInfo({item}:{item:Item}):React.ReactElement{return <dl className="lf-detail"><div><dt>色</dt><dd>{item.colors.join('・') || '不明'}</dd></div><div><dt>特徴</dt><dd>{item.feature || '登録なし'}</dd></div><div><dt>拾得場所</dt><dd>{item.place || getBuilding(item.building)?.name || getCampus(item.campus)?.name || '不明'}</dd></div><div><dt>拾得日</dt><dd>{item.foundOn || '不明'}</dd></div><div><dt>保管場所</dt><dd>{item.window}</dd></div></dl>;}
function RequestInfo({request}:{request:Request}):React.ReactElement {
  const group=CATEGORY_GROUPS.find(candidate=>candidate.code===request.criteria.parent);
  const category=group?.children.find(candidate=>candidate.code===request.criteria.category);
  const place=getBuilding(request.criteria.building)?.name || getCampus(request.criteria.campus)?.name || '指定なし';
  const period=request.criteria.dateFrom&&request.criteria.dateTo?`${request.criteria.dateFrom} ～ ${request.criteria.dateTo}`:request.criteria.dateFrom?`${request.criteria.dateFrom}以降`:request.criteria.dateTo?`${request.criteria.dateTo}まで`:'指定なし';
  return <dl className="lf-request-details">
    <div><dt>種類</dt><dd>{group?.name || '指定なし'}</dd></div>
    <div><dt>細かい種類</dt><dd>{category?.name || '指定なし'}</dd></div>
    <div><dt>色</dt><dd>{request.criteria.colors.join('・') || '指定なし'}</dd></div>
    <div><dt>キャンパス・場所</dt><dd>{place}</dd></div>
    <div><dt>なくした時期</dt><dd>{period}</dd></div>
    <div><dt>検索キーワード</dt><dd>{request.criteria.query || '指定なし'}</dd></div>
    <div><dt>特徴</dt><dd>{request.feature || '入力なし'}</dd></div>
  </dl>;
}
function AccountInfo({data}:{data:Snapshot}):React.ReactElement {
  return <section className="lf-panel"><h2>サインイン情報</h2><dl className="lf-detail"><div><dt>学籍番号</dt><dd>{studentIdFromEmail(data.user.email)}</dd></div><div><dt>学校メール</dt><dd>{data.user.email}</dd></div></dl><p className="lf-muted">大学のMicrosoft 365アカウントでサインインしています。サインインとパスワードは大学のMicrosoft 365で管理され、このアプリには保存されません。</p></section>;
}
type Run=(work:()=>Promise<void>,message:string,after?:()=>void)=>void;
function RequestForm({request,criteria,service,run,after}:{request?:Request;criteria:Criteria;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [c,setC]=React.useState(request?.criteria || criteria);
  const [feature,setFeature]=React.useState(request?.feature || '');
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.saveRequest(c,feature,request?.id),request?'紛失申告の内容を保存しました。':'紛失申告を登録しました。条件に合う候補が見つかるとお知らせします。',after);}}>
    {!request&&<p className="lf-muted">紛失した物の種類・色・場所・日付・特徴を申告します。条件に合う候補が見つかるとお知らせします。公開一覧に出ない品物は職員が確認します。</p>}
    <Conditions value={c} onChange={setC} requireCategory/>
    {c.query&&<Field label="検索キーワード"><input value={c.query} onChange={e=>setC({...c,query:e.target.value})}/></Field>}
    <p className="lf-hint">日付には、なくした時期を入力してください。通知では開始日以降に拾われた物を対象にします。</p>
    <Field label="特徴（任意）" hint="ブランド・型番、傷やシール、中身など。職員と本人だけが確認します。"><textarea rows={4} maxLength={1000} value={feature} onChange={e=>setFeature(e.target.value)}/></Field>
    <button type="submit" className="lf-primary">{request?'変更を保存':'紛失申告を登録'}</button>
  </form>;
}
function ClaimForm({item,requestId,data,service,run,after}:{item:Item;requestId?:string;data:Snapshot;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [feature,setFeature]=React.useState(''); const r=data.requests.find(q=>q.id===requestId);
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.createClaim(item.id,feature,requestId),'受け取りを申し込みました。窓口で学校メールをお伝えください。',after);}}><h3>{item.title}</h3><p>受取窓口：<strong>{item.window}</strong></p>{r?<p className="lf-info">登録済みの特徴を引き継ぎます。再入力は不要です。</p>:<Field label="特徴（任意）" hint="ブランド・型番、傷やシールなど、分かる範囲で。未入力でも申し出できます。"><textarea maxLength={1000} rows={4} value={feature} onChange={e=>setFeature(e.target.value)}/></Field>}<p className="lf-muted">窓口で持ち主であることを確認してから返却します。</p><button className="lf-primary" type="submit">受け取りを申し込む</button></form>;
}
function ThanksForm({claimId,service,run,after}:{claimId:string;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [message,setMessage]=React.useState('');return <form className="lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.saveThanks(claimId,message),'感謝の一言を受け付けました。公開反映までお待ちください。',after);}}><Field label="感謝の一言（任意・200文字以内）" hint="匿名で公開されます。名前や連絡先などの個人情報は書かないでください。"><textarea required rows={4} maxLength={200} value={message} onChange={e=>setMessage(e.target.value)} placeholder="届けてくれてありがとうございました。"/></Field><button className="lf-primary" type="submit">一言を送る</button></form>;
}
export default function LostFoundApp({service}:{service:AppService}):React.ReactElement {
  const [data,setData]=React.useState<Snapshot>();const [page,setPage]=React.useState<Page>('search');const [criteria,setCriteria]=React.useState(emptyCriteria);const [draft,setDraft]=React.useState(emptyCriteria);const [filtersApplied,setFiltersApplied]=React.useState(false);
  const [busy,setBusy]=React.useState(false);const [error,setError]=React.useState('');const [message,setMessage]=React.useState('');const [modal,setModal]=React.useState<ModalState>();
  const lock=React.useRef(false);const heading=React.useRef<HTMLElement>(null);
  const reload=React.useCallback(async()=>{setData(await service.load());},[service]);
  React.useEffect(()=>{let active=true;service.load().then(d=>{if(active){setData(d);setPage(new URLSearchParams(window.location.search).has('lfNotice')?'notices':'search');}}).catch(e=>{if(active)setError(String(e.message||e));});return()=>{active=false;};},[service]);
  React.useEffect(()=>{
    let active=true;
    const refresh=():void=>{if(document.visibilityState==='visible'&&!lock.current)service.load().then(d=>{if(active)setData(d);}).catch(()=>{/* Explicit refresh reports connection errors. */});};
    window.addEventListener('focus',refresh);window.addEventListener('storage',refresh);document.addEventListener('visibilitychange',refresh);
    const timer=window.setInterval(refresh,30000);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[service]);
  const run:Run=(work,success,after)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');work().then(async()=>{await reload();setMessage(success);after?.();}).catch(async e=>{setError(String(e.message||e));try{await reload();}catch{/* Retain input on connection failure. */}}).finally(()=>{lock.current=false;setBusy(false);});};
  const navigate=(p:Page):void=>{setPage(p);setError('');setMessage('');window.setTimeout(()=>{heading.current?.scrollTo(0,0);heading.current?.focus();},0);};
  const close=():void=>setModal(undefined);
  const itemCard=(item:Item):React.ReactElement=><button type="button" className="lf-item-card" key={item.id} onClick={()=>setModal({kind:'item',item})}><div className="lf-card-content"><h3>{item.title}</h3><p>色：{item.colors.join('・') || '不明'}</p><p className="lf-card-feature">特徴：{item.feature || '登録なし'}</p><div className="lf-card-footer"><span>保管場所：{item.window}</span><span>拾得日：{item.foundOn || '不明'}</span></div></div><span className="lf-chevron">›</span></button>;
  const claimReturned=(id:string):boolean=>!!data?.notices.some(n=>n.kind==='RETURN'&&n.claimId===id);
  let content:React.ReactNode;
  if(!data) content=<Empty title={error?'読み込めませんでした':'読み込み中…'}>{error&&<button onClick={()=>run(reload,'再読込しました。')}>再試行</button>}</Empty>;
  else if(page==='settings') content=<AccountInfo data={data}/>;
  else if(page==='search') {
    const results=data.items.filter(i=>matches(i,criteria));
    const conditionLabels=[criteria.query.trim(),criteria.parent&&categoryName(criteria.parent,criteria.category),criteria.colors.join('・'),getCampus(criteria.campus)?.name,criteria.dateFrom&&`${criteria.dateFrom}以降`,criteria.dateTo&&`${criteria.dateTo}まで`].filter(Boolean);
    const hasCriteria=conditionLabels.length>0;
    content=<>
      <form className="lf-search-bar" onSubmit={e=>{e.preventDefault();}}><input aria-label="キーワードで探す" placeholder="種類・色・特徴など" value={criteria.query} onChange={e=>{setCriteria({...criteria,query:e.target.value});setFiltersApplied(false);}}/><button type="button" className="lf-filter-button" onClick={()=>{setDraft(criteria);setModal({kind:'filters'});}}>絞り込み</button></form>
      <div className="lf-notification-prompt" role="region" aria-label="見つからない物の通知">
        <Mark type="notices"/>
        <p>{filtersApplied&&hasCriteria?'候補に自分の物がなければ、この検索条件で紛失申告を登録し、通知を待てます。':'絞り込み後、候補に自分の物がなければ、紛失申告を登録できます。'}</p>
        {filtersApplied&&hasCriteria&&<button type="button" onClick={()=>setModal({kind:'request'})}>紛失申告を登録</button>}
      </div>
      {hasCriteria&&<p className="lf-search-summary"><span>{conditionLabels.join(' ／ ')}</span><button className="lf-text-button" onClick={()=>{setCriteria(emptyCriteria());setFiltersApplied(false);}}>解除</button></p>}
      <div className="lf-section-heading"><h2>公開中の拾得物 <span>{results.length}件</span></h2><span>拾得日の新しい順</span></div>
      {results.length?<div className="lf-item-grid">{results.sort((a,b)=>b.foundOn.localeCompare(a.foundOn)).map(itemCard)}</div>:<section className="lf-search-empty"><p>{hasCriteria?'この条件に合う公開中の拾得物はありません。':'現在、公開中の拾得物はありません。'}</p></section>}
    </>;

  } else if(page==='requests') {
    const requests=data.requests.filter(r=>r.status!=='CANCELLED').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id,undefined,{numeric:true}));
    content=<><div className="lf-section-heading"><h2>登録した紛失申告</h2><button className="lf-primary" onClick={()=>{setDraft(emptyCriteria());setFiltersApplied(false);setPage('search');setModal({kind:'filters'});}}>別の紛失申告を登録</button></div><div className="lf-stack">{requests.map(r=><article className="lf-panel" key={r.id}><div className="lf-card-meta lf-card-meta-status"><span className="lf-badge">{r.status==='ACTIVE'?'通知待ち':r.status==='RESOLVED'?'解決済み':'取り下げ済み'}</span></div><h3>{categoryName(r.criteria.parent,r.criteria.category)}</h3><RequestInfo request={r}/><p className="lf-muted">登録日時：{stamp(r.createdAt)}</p>{data.claims.filter(c=>c.requestId===r.id&&c.status!=='CANCELLED').map(c=><button key={c.id} onClick={()=>navigate('claims')}>受け取り予定を見る</button>)}{data.notices.some(n=>n.requestId===r.id&&(n.kind==='MATCH'||n.kind==='VALUABLE'))&&<button onClick={()=>navigate('notices')}>届いたお知らせを見る</button>}{r.status==='ACTIVE'&&<div className="lf-actions"><button onClick={()=>setModal({kind:'request',request:r})}>編集</button><button onClick={()=>{if(window.confirm('この紛失申告を取り下げますか？'))run(()=>service.cancelRequest(r.id),'紛失申告を取り下げました。');}}>取り下げ</button></div>}</article>)}</div>{!requests.length&&<Empty title="登録した紛失申告はありません"/>}</>;
  } else if(page==='claims') content=<><div className="lf-stack">{data.claims.map(c=><article className="lf-panel" key={c.id}><div className="lf-card-meta"><span className="lf-badge">{claimReturned(c.id)?'返却済み':c.status==='CANCELLED'?'取り下げ済み':'受付中'}</span></div><h3>{c.title}</h3><p>受取窓口：{c.window}</p>{c.feature&&<details><summary>窓口に伝えた特徴</summary><p>{c.feature}</p></details>}<p className="lf-muted">学校メールを窓口で伝えてください。現物と本人確認の後に受け取れます。</p><p className="lf-muted">{stamp(c.createdAt)}</p>{c.status==='PENDING'&&!claimReturned(c.id)&&<button onClick={()=>{if(window.confirm('受け取り申し込みを取り下げますか？'))run(()=>service.cancelClaim(c.id),'申出を取り下げました。');}}>申出を取り下げる</button>}</article>)}</div>{!data.claims.length&&<Empty title="受け取り申し込みはまだありません"/>}</>;
  else if(page==='notices') content=<><div className="lf-stack">{data.notices.slice().reverse().map(n=><article className="lf-panel" key={n.id}><span className="lf-eyebrow">{stamp(n.createdAt)}</span><h3>{n.title}</h3><p>{n.message}</p><p>受取窓口：{n.window}</p>{n.kind==='MATCH'&&<button onClick={()=>{const i=data.items.find(x=>x.id===n.itemId);if(i)setModal({kind:'item',item:i,requestId:n.requestId});else setError('現在は保管中ではありません。窓口へ確認してください。');}}>候補の詳細を見る</button>}{n.kind==='VALUABLE'&&<button className="lf-primary" onClick={()=>run(()=>service.createClaim(n.itemId,'',n.requestId),'窓口での確認予定を登録しました。',()=>setPage('claims'))}>窓口で確認する</button>}</article>)}</div>{!data.notices.length&&<Empty title="新しいお知らせはありません"/>}</>;
  else if(page==='history') content=<><div className="lf-stack">{data.notices.filter(n=>n.kind==='RETURN'||n.kind==='FINDER').map(n=><article className="lf-panel" key={n.id}><span className="lf-badge">{n.kind==='FINDER'?'届けた実績':'受取済み'}</span><h3>{n.title}</h3><p>{n.window} · {stamp(n.createdAt)}</p>{n.kind==='RETURN'&&<button onClick={()=>setModal({kind:'thanks',claimId:n.claimId})}>感謝の一言を残す（任意）</button>}</article>)}</div>{!data.notices.some(n=>n.kind==='RETURN'||n.kind==='FINDER')&&<Empty title="返却履歴はまだありません"/>}</>;
  else if(page==='thanks') content=<><div className="lf-hero compact"><Mark type="thanks"/><h2>届けてくれて、ありがとう。</h2><p>学内で生まれた、小さな親切の記録。</p></div><div className="lf-item-grid">{data.thanks.slice().reverse().map(t=><blockquote className="lf-panel lf-thanks" key={t.id}><p>{t.message}</p><footer>匿名 · {stamp(t.createdAt)}</footer></blockquote>)}</div>{!data.thanks.length&&<Empty title="感謝の一言はまだありません"/>}</>;
  return <div className="lf-app lf-student"><div className="lf-main"><header className="lf-topbar"><div className="lf-brand"><span className="lf-logo">L</span><strong>Lost & Found<small>大学の落とし物</small></strong></div><div className="lf-top-actions"><button className="lf-icon-button" aria-label="利用者設定" onClick={()=>navigate('settings')}><Mark type="settings"/></button></div></header>
    <main ref={heading} tabIndex={-1} aria-label={labels[page]}>{page!=='search'&&page!=='requests'&&page!=='claims'&&<div className="lf-page-title"><h1>{labels[page]}</h1></div>}{!!data?.warnings?.length&&<div className="lf-error" role="alert">一部の保存データの形式を確認できません。職員に修正を依頼してください（{data.warnings.join('、')}）。</div>}{!modal&&error&&<div className="lf-error" role="alert">{error}</div>}{message&&<div className="lf-success" role="status">{message}</div>}{busy&&<div className="lf-loading" role="status">保存・更新しています…</div>}{(page==='requests'||page==='claims')&&<><nav className="lf-tracking-tabs" aria-label="登録・受取"><button aria-current={page==='requests'?'page':undefined} onClick={()=>navigate('requests')}>紛失申告</button><button aria-current={page==='claims'?'page':undefined} onClick={()=>navigate('claims')}>受け取り予定</button></nav><p className="lf-muted">{page==='requests'?'紛失した物の種類・色・場所・日付・特徴を申告できます。登録した条件に合う候補が見つかるとお知らせします。':'自分の物だと思う拾得物の受け取り申し込みです。表示された窓口で確認して受け取ってください。'}</p></>}<fieldset className="lf-content" disabled={busy}>{content}</fieldset></main>
    <nav className="lf-bottom-nav" aria-label="学生メニュー">{(['search','requests','notices','history','thanks'] as Page[]).map(p=><button key={p} aria-current={page===p||(p==='requests'&&page==='claims')?'page':undefined} onClick={()=>navigate(p)}><Mark type={p}/><span>{p==='search'?'探す':p==='requests'?'登録・受取':p==='history'?'履歴':labels[p]}</span></button>)}</nav></div>
    {modal&&data&&<Modal title={modal.kind==='item'?'拾得物の詳細':modal.kind==='request'?(modal.request?'紛失申告を編集':'紛失申告を登録'):modal.kind==='thanks'?'感謝の一言':modal.kind==='filters'?'検索条件':'受け取りの申し込み'} onClose={()=>{setError('');close();}} busy={busy}>{error&&<div className="lf-error" role="alert">{error}</div>}<fieldset className="lf-content" disabled={busy}>
      {modal.kind==='item'&&<><div className="lf-card-meta"><span>受付番号 #{modal.item.id}</span><span className="lf-badge">{modal.item.status}</span></div><h3>{modal.item.title}</h3><ItemInfo item={modal.item}/><p className="lf-muted">窓口で持ち主であることを確認します。</p><button className="lf-primary" onClick={()=>setModal({kind:'claim',item:modal.item,requestId:modal.requestId})}>自分のものだと思う</button></>}
      {modal.kind==='filters'&&<form className="lf-form" onSubmit={e=>{e.preventDefault();setCriteria(draft);setFiltersApplied(true);close();}}><p className="lf-muted">候補に自分の物がなければ、この検索条件で紛失申告を登録できます。</p><Conditions value={draft} onChange={setDraft}/><div className="lf-actions"><button type="button" onClick={()=>setDraft(emptyCriteria())}>条件をクリア</button><button type="submit" className="lf-primary">この条件で探す</button></div></form>}
      {modal.kind==='request'&&<RequestForm request={modal.request} criteria={criteria} service={service} run={run} after={()=>{close();setPage('requests');}}/>}
      {modal.kind==='claim'&&<><ItemInfo item={modal.item}/><ClaimForm item={modal.item} requestId={modal.requestId} data={data} service={service} run={run} after={()=>{close();setPage('claims');}}/></>}
      {modal.kind==='thanks'&&<ThanksForm claimId={modal.claimId} service={service} run={run} after={close}/>}
    </fieldset></Modal>}
  </div>;
}
