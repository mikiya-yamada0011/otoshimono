import * as React from 'react';
import { AdminAppService as AppService } from './WorkflowService';
import { Snapshot, Criteria, Item, ItemInput, Request, Claim, Profile, COLORS, WINDOWS, emptyCriteria, today, categoryName, isValuable, matches, studentIdFromEmail } from '../../src/webparts/lostFoundStudent/app/model';
import { CATEGORY_GROUPS } from '../../src/webparts/lostFoundStudent/found-items/utils/categories';
import { CAMPUSES, getCampus, getBuilding } from '../../src/webparts/lostFoundStudent/found-items/utils/locations';
import '../../src/webparts/lostFoundStudent/app/app.scss';

type Page = 'search'|'requests'|'claims'|'notices'|'history'|'thanks'|'settings'|'inventory'|'register';
type ModalState = {kind:'item';item:Item} | {kind:'request';request?:Request} | {kind:'claim';item:Item;requestId?:string} | {kind:'return';item:Item} | {kind:'correct';item:Item} | {kind:'edit';item:Item} | {kind:'notify';request:Request} | {kind:'thanks';claimId:string};
const stamp=(s:string):string=>s?new Date(s).toLocaleString('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const labels:Record<Page,string>={search:'落とし物を探す',requests:'なくした物',claims:'返却する',notices:'お知らせ',history:'返却履歴',thanks:'ありがとう',settings:'利用者設定',inventory:'保管中の拾得物',register:'拾得物を登録'};
function Mark({type}:{type:string}):React.ReactElement {
  const paths:Record<string,React.ReactNode>={search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,requests:<><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></>,claims:<><path d="m4 12 5 5L20 6M3 4h6M3 8h4"/></>,notices:<><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zM10 20h4"/></>,history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2"/></>,thanks:<path d="M12 20 3 11C-1 4 8 0 12 7c4-7 13-3 9 4z"/>,settings:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></>,inventory:<><path d="m3 7 9-4 9 4v13H3zM3 7h18M9 11h6"/></>,register:<path d="M12 3v18M3 12h18"/>};
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type] || paths.search}</svg>;
}
function Empty({title,children}:{title:string;children?:React.ReactNode}):React.ReactElement{return <div className="lf-empty"><Mark type="search"/><h3>{title}</h3>{children}</div>;}
function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}):React.ReactElement{return <label className="lf-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
function Colors({value,onChange}:{value:string[];onChange:(colors:string[])=>void}):React.ReactElement{
  return <fieldset className="lf-colors"><legend>色 <small>複数選択・どれか1色が合えば一致</small></legend><div>{COLORS.map(color=><button type="button" key={color} aria-pressed={value.includes(color)} onClick={()=>onChange(value.includes(color)?value.filter(c=>c!==color):[...value,color])}>{color}</button>)}</div></fieldset>;
}
function Conditions({value,onChange,dates=true,registration=false}:{value:Criteria;onChange:(c:Criteria)=>void;dates?:boolean;registration?:boolean}):React.ReactElement{
  const group=CATEGORY_GROUPS.find(g=>g.code===value.parent);
  return <div className="lf-fields">
    <div className="lf-grid2"><Field label={registration?"種類（必須）":"種類"}><select required={registration} value={value.parent} onChange={e=>onChange({...value,parent:e.target.value,category:''})}><option value="">{registration?"選択してください":"すべての種類"}</option>{CATEGORY_GROUPS.map(g=><option key={g.code} value={g.code}>{g.name}</option>)}</select></Field>
    <Field label={registration?"細かい種類（必須）":"細かい種類"}><select required={registration} value={value.category} disabled={!group} onChange={e=>onChange({...value,category:e.target.value})}><option value="">{registration?'選択してください':'指定なし'}</option>{group?.children.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field></div>
    <Colors value={value.colors} onChange={colors=>onChange({...value,colors})}/>
    <div className="lf-grid2"><Field label={registration?"拾得キャンパス（必須）":"キャンパス"}><select required={registration} value={value.campus} onChange={e=>onChange({...value,campus:e.target.value,building:''})}><option value="">{registration?'選択してください':'指定なし'}</option>{CAMPUSES.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
    <Field label="建物・エリア"><select value={value.building} disabled={!value.campus} onChange={e=>onChange({...value,building:e.target.value})}><option value="">指定なし</option>{getCampus(value.campus)?.buildings.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}</select></Field></div>
    {dates&&<div className="lf-grid2"><Field label="日付（開始）"><input type="date" value={value.dateFrom} max={value.dateTo || today()} onChange={e=>onChange({...value,dateFrom:e.target.value})}/></Field><Field label="日付（終了）"><input type="date" value={value.dateTo} min={value.dateFrom} max={today()} onChange={e=>onChange({...value,dateTo:e.target.value})}/></Field></div>}
  </div>;
}
function Modal({title,onClose,busy,children}:{title:string;onClose:()=>void;busy:boolean;children:React.ReactNode}):React.ReactElement {
  const ref=React.useRef<HTMLDivElement>(null); const closeRef=React.useRef(onClose);closeRef.current=onClose;
  React.useEffect(()=>{const last=document.activeElement as HTMLElement;const el=ref.current;el?.focus();const listener=(e:KeyboardEvent):void=>{if(e.key==='Escape'&&!busy)closeRef.current();if(e.key==='Tab'&&el){const all=Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'));const first=all[0],end=all[all.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===el)){e.preventDefault();end?.focus();}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',listener);return()=>{document.removeEventListener('keydown',listener);last?.focus();};},[busy]);
  return <div className="lf-overlay"><div className="lf-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><header><h2>{title}</h2><button type="button" className="lf-icon-button" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button></header>{children}</div></div>;
}
function ItemInfo({item}:{item:Item}):React.ReactElement{return <dl className="lf-detail"><div><dt>色</dt><dd>{item.colors.join('・') || '不明'}</dd></div><div><dt>拾得場所</dt><dd>{item.place || getBuilding(item.building)?.name || getCampus(item.campus)?.name || '不明'}</dd></div><div><dt>拾得日</dt><dd>{item.foundOn || '不明'}</dd></div><div><dt>保管場所</dt><dd>{item.window}</dd></div>{item.feature&&<div><dt>特徴</dt><dd>{item.feature}</dd></div>}</dl>;}
function ProfileForm({data,service,run}:{data:Snapshot;service:AppService;run:Run}):React.ReactElement{
  const [email,setEmail]=React.useState(data.profile?.email || data.user.email);
  const [window,setWindow]=React.useState(data.profile?.window || '');
  return <form className="lf-panel lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.saveProfile({email,window}),'利用者情報を保存しました。');}}><h2>{data.profile?'利用者設定':'はじめに利用者情報を登録'}</h2><p className="lf-muted">{data.user.role==='staff'?'ここで設定した保管窓口を、新規登録の初期値にします。':'学校メールの「@」より前を学籍番号として使用します。パスワードは大学のMicrosoftサインインで管理され、この画面では保存しません。'}</p><Field label={data.user.role==='staff'?'職員メール':'学校メール（学籍番号付き・必須）'} hint={data.user.role==='student'?`対象：${service.domains.join(' / ')}`:undefined}><input required type="email" value={email} readOnly={data.user.role==='staff'} autoComplete="email" onChange={e=>setEmail(e.target.value)}/></Field>{data.user.role==='staff'&&<Field label="いつもの保管窓口"><input list="lf-windows" required value={window} onChange={e=>setWindow(e.target.value)} placeholder="農学部事務室"/></Field>}<button className="lf-primary" type="submit">保存する</button></form>;
}
type Run=(work:()=>Promise<void>,message:string,after?:()=>void)=>void;
function ItemForm({item,profile,service,run,after}:{item?:Item;profile?:Profile;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [criteria,setCriteria]=React.useState<Criteria>({...emptyCriteria(),parent:item?.parent || '',category:item?.category || '',colors:item?.colors || [],campus:item?.campus || '',building:item?.building || ''});
  const [date,setDate]=React.useState(item?.foundOn ?? today());const [place,setPlace]=React.useState(item?.place || '');
  const [window,setWindow]=React.useState(item?.window || profile?.window || '');const [feature,setFeature]=React.useState(item?.feature || '');
  const [valuable,setValuable]=React.useState(item?.valuable || false);const [finder,setFinder]=React.useState(item?.finderEmail || '');const [note,setNote]=React.useState(item?.internalNote || '');
  const protectedCategory=isValuable(criteria.parent,criteria.category);
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();const input:ItemInput={parent:criteria.parent,category:criteria.category,colors:criteria.colors,campus:criteria.campus,building:criteria.building,title:categoryName(criteria.parent,criteria.category),foundOn:date,place:place.trim() || getBuilding(criteria.building)?.name || getCampus(criteria.campus)?.name || '',window:window.trim(),feature,valuable:valuable||protectedCategory,finderEmail:finder.trim().toLowerCase(),internalNote:note};run(()=>service.saveItem(input,item?.id),item?'拾得物を更新しました。':'拾得物を登録しました。',after);}}>
    <Conditions value={criteria} onChange={setCriteria} dates={false} registration/>
    <Field label="拾得場所の補足（任意）"><input value={place} maxLength={200} onChange={e=>setPlace(e.target.value)} placeholder="食堂入口付近など"/></Field>
    <div className="lf-grid2"><Field label="拾得日（不明なら空欄）"><input type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="保管場所（必須）" hint="新規登録時は職員設定の窓口が初期値になります。"><input required list="lf-windows" value={window} maxLength={150} onChange={e=>setWindow(e.target.value)}/></Field></div>
    <Field label="特徴（任意）" hint="通常品では学生にも表示します。本人確認用の情報や個人情報は内部メモへ。"><textarea rows={3} maxLength={255} value={feature} onChange={e=>setFeature(e.target.value)} placeholder="白い縁取り、木製の持ち手など"/></Field>
    <label className="lf-check"><input type="checkbox" checked={valuable||protectedCategory} disabled={protectedCategory} onChange={e=>setValuable(e.target.checked)}/>{protectedCategory?'個人情報を含むため非公開':'学生一覧に公開しない（高価な物など）'}</label>
    {(valuable||protectedCategory)&&<p className="lf-info">この拾得物は学生の一覧・詳細・自動通知に表示しません。</p>}
    <details><summary>内部メモ・届けた人の連絡先（任意）</summary><Field label="内部メモ"><textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field><Field label="届けた人の学校メール" hint="本人が通知を希望する場合のみ登録。返却後に定型のお礼を送ります。"><input type="email" value={finder} onChange={e=>setFinder(e.target.value)}/></Field></details>
    <button className="lf-primary" type="submit">{item?'変更を保存':'拾得物を登録'}</button>
  </form>;
}
function RequestForm({request,criteria,service,run,after}:{request?:Request;criteria:Criteria;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [c,setC]=React.useState(request?.criteria || {...criteria,query:''});const [feature,setFeature]=React.useState(request?.feature || '');
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.saveRequest(c,feature,request?.id),'なくした物の登録を保存しました。',after);}}><p className="lf-muted">この申告に公開区分はありません。公開品の自動照合と、職員による非公開品の確認の両方に使います。</p><Conditions value={c} onChange={setC}/><p className="lf-hint">日付には、なくした時期を入力してください。通知では開始日以降に拾われた物を対象にします。</p><Field label="特徴（任意）" hint="ブランド・型番、傷やシール、中身など、分かる範囲で。職員と本人だけが見られます。"><textarea rows={4} maxLength={1000} value={feature} onChange={e=>setFeature(e.target.value)}/></Field><button type="submit" className="lf-primary">{request?'変更を保存':'なくした物を登録'}</button></form>;
}
function ClaimForm({item,requestId,data,service,run,after}:{item:Item;requestId?:string;data:Snapshot;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [feature,setFeature]=React.useState(''); const r=data.requests.find(q=>q.id===requestId);
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.createClaim(item.id,feature,requestId),'返却を申し出ました。受付番号を窓口でお伝えください。',after);}}><h3>{item.title}</h3><p>受取窓口：<strong>{item.window}</strong></p>{r?<p className="lf-info">登録済みの特徴を引き継ぎます。再入力は不要です。</p>:<Field label="特徴（任意）" hint="ブランド・型番、傷やシールなど、分かる範囲で。未入力でも申し出できます。"><textarea maxLength={1000} rows={4} value={feature} onChange={e=>setFeature(e.target.value)}/></Field>}<p className="lf-muted">窓口で持ち主であることを確認してから返却します。</p><button className="lf-primary" type="submit">返却を申し出る</button></form>;
}
function ReturnForm({item,claims,service,run,after}:{item:Item;claims:Claim[];service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [recipient,setRecipient]=React.useState(claims.length===1?claims[0].id:claims.length===0?'walkin':'');
  const [email,setEmail]=React.useState('');const [confirmed,setConfirmed]=React.useState(false);
  const claim=claims.find(c=>c.id===recipient);const ready=recipient==='walkin'||!!claim;
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();if(ready)run(()=>service.returnItem(item.id,claim?.email||email,claim?.id||'',confirmed),'返却を記録しました。',after);}}>
    <div className="lf-info">#{item.id} · {item.title}<br/>色：{item.colors.join('・')||'不明'}<br/>特徴：{item.feature||'入力なし'}</div>
    <Field label="返却する相手"><select value={recipient} onChange={e=>{setRecipient(e.target.value);setEmail('');setConfirmed(false);}}>
      <option value="" disabled>申告を選択してください</option>
      {claims.map(c=><option key={c.id} value={c.id}>{studentIdFromEmail(c.email)} / {c.email}</option>)}
      <option value="walkin">事前申告なしで受け付ける</option>
    </select></Field>
    {ready&&<><Field label="返却先の学校メール（学籍番号付き）"><input required type="email" value={claim?.email||email} readOnly={!!claim} onChange={e=>setEmail(e.target.value)}/></Field>
    <Field label="学生が申告した特徴"><div className="lf-quote">{claim?.feature||'事前入力なし。窓口で確認してください。'}</div></Field></>}
    <label className="lf-check"><input required type="checkbox" disabled={!ready} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>現物と申告内容を確認し、本人確認を完了しました</label>
    <button type="submit" className="lf-primary" disabled={!ready||!confirmed}>返却済みにする</button>
  </form>;
}
function CorrectForm({item,service,run,after}:{item:Item;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [reason,setReason]=React.useState('');
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.correctReturn(item.id,reason),'返却記録を訂正し、保管中に戻しました。',after);}}><p>#{item.id} {item.title} を保管中に戻します。現物が窓口にあることを確認してください。</p><Field label="訂正理由（必須）"><textarea required maxLength={1000} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></Field><p className="lf-muted">訂正前の返却先・日時と理由を残します。送信済みのメールは取り消せないため、必要な連絡は職員から行ってください。</p><button className="lf-primary" type="submit">理由を残して保管中に戻す</button></form>;
}
function NotifyForm({request,data,service,run,after}:{request:Request;data:Snapshot;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [id,setId]=React.useState('');const [scope,setScope]=React.useState('own');const [kind,setKind]=React.useState('all');const [query,setQuery]=React.useState('');const [checked,setChecked]=React.useState(false);
  const items=data.items.filter(i=>i.valuable&&i.status==='保管中'&&(scope==='all'||i.window===data.profile?.window)&&(kind==='all'||i.parent===request.criteria.parent)&&[i.id,i.title,i.feature].join(' ').includes(query));
  const item=items.find(i=>i.id===id);const reset=():void=>{setId('');setChecked(false);};
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();if(item&&checked)run(()=>service.notify(item.id,request.id),'本人への案内を登録しました。',after);}}>
    <h3>{categoryName(request.criteria.parent,request.criteria.category)}</h3><p>学籍番号：{studentIdFromEmail(request.email)}<br/>{request.email}</p><p>色：{request.criteria.colors.join('・')||'不明'} ／ 紛失時期：{request.criteria.dateFrom||'不明'}</p><div className="lf-quote">{request.feature||'特徴の入力なし'}</div>
    <div className="lf-grid2"><Field label="保管窓口"><select value={scope} onChange={e=>{setScope(e.target.value);reset();}}><option value="own">所属窓口</option><option value="all">全窓口</option></select></Field><Field label="保管品の種類"><select value={kind} onChange={e=>{setKind(e.target.value);reset();}}><option value="all">非公開の保管品すべて</option><option value="same">申告と同じ種類</option></select></Field></div>
    <Field label="保管品を検索"><input value={query} onChange={e=>{setQuery(e.target.value);reset();}} placeholder="受付番号・種類・特徴"/></Field>
    <div className="lf-item-grid">{items.map(i=><button type="button" className="lf-item-card" key={i.id} aria-pressed={id===i.id} onClick={()=>{setId(i.id);setChecked(false);}}><div className="lf-card-meta"><span>#{i.id}</span><span>{id===i.id?'選択中':''}</span></div><h3>{i.title}</h3><p>色：{i.colors.join('・')||'不明'}</p><p>特徴：{i.feature||'入力なし'}</p><p>保管場所：{i.window}</p></button>)}</div>
    {!items.length&&<p>条件に合う保管品はありません。窓口や種類の絞り込みを変更できます。</p>}
    <label className="lf-check"><input type="checkbox" checked={checked} disabled={!item} onChange={e=>setChecked(e.target.checked)}/>現物と申告内容を確認した{item?`（選択：#${item.id} ${item.title}）`:''}</label>
    <p className="lf-muted">高価な物・現金・カード・証明書・スマホなど、学生一覧に公開しない保管品が対象です。本人には受取窓口だけを案内し、品物の特徴は公開しません。</p><button className="lf-primary" type="submit" disabled={!item||!checked}>この品物で本人へ案内</button>
  </form>;
}
function ThanksForm({claimId,service,run,after}:{claimId:string;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [message,setMessage]=React.useState('');return <form className="lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.saveThanks(claimId,message),'感謝の一言を受け付けました。公開反映までお待ちください。',after);}}><Field label="感謝の一言（任意・200文字以内）" hint="匿名で公開されます。名前や連絡先などの個人情報は書かないでください。"><textarea required rows={4} maxLength={200} value={message} onChange={e=>setMessage(e.target.value)} placeholder="届けてくれてありがとうございました。"/></Field><button className="lf-primary" type="submit">一言を送る</button></form>;
}
export default function StaffHarnessApp({service}:{service:AppService}):React.ReactElement {
  const [data,setData]=React.useState<Snapshot>();const [page,setPage]=React.useState<Page>('search');const [criteria,setCriteria]=React.useState(emptyCriteria);const [filters,setFilters]=React.useState(false);
  const [inventoryFilter,setInventoryFilter]=React.useState(emptyCriteria);const [scope,setScope]=React.useState('own');const [collapsed,setCollapsed]=React.useState(false);const [busy,setBusy]=React.useState(false);const [error,setError]=React.useState('');const [message,setMessage]=React.useState('');const [modal,setModal]=React.useState<ModalState>();const [query,setQuery]=React.useState('');const [kind,setKind]=React.useState('all');const [registration,setRegistration]=React.useState(0);
  const [claimsOnly,setClaimsOnly]=React.useState(false);
  const lock=React.useRef(false);const heading=React.useRef<HTMLHeadingElement>(null);
  const reload=React.useCallback(async()=>{const snapshot=await service.load();setData(snapshot);},[service]);
  React.useEffect(()=>{let active=true;service.load().then(d=>{if(active){setData(d);setPage(d.user.role==='staff'?'inventory':new URLSearchParams(window.location.search).has('lfNotice')?'notices':'search');}}).catch(e=>{if(active)setError(String(e.message || e));});return()=>{active=false;};},[service]);
  React.useEffect(()=>{
    let active=true;
    const refresh=():void=>{if(document.visibilityState==='visible'&&!lock.current)service.load().then(d=>{if(active)setData(d);}).catch(()=>{/* Keep the last loaded snapshot while temporarily offline. */});};
    window.addEventListener('focus',refresh);window.addEventListener('storage',refresh);document.addEventListener('visibilitychange',refresh);
    const timer=window.setInterval(refresh,30000);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[service]);
  const run:Run=(work,success,after)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');work().then(async()=>{await reload();setMessage(success);after?.();}).catch(async e=>{setError(String(e.message||e));try{await reload();}catch{/* Keep current input and error available for retry. */}}).finally(()=>{lock.current=false;setBusy(false);});};
  const navigate=(p:Page):void=>{setPage(p);if(p==='inventory'||p==='claims')setScope('own');reload().catch(e=>setError(String(e.message||e)));setQuery('');setKind('all');setError('');setMessage('');window.setTimeout(()=>heading.current?.focus(),0);};
  const staff=data?.user.role==='staff';
  const pages:Page[]=staff?['inventory','requests','history','notices','settings']:['search','requests','claims','notices','history','thanks','settings'];
  const close=():void=>setModal(undefined);
  const afterClaim=():void=>{close();setPage('claims');};
  const canReturn=(item:Item):boolean=>!!data?.profile?.window && item.window===data.profile.window && item.status==='保管中';
  const hasClaim=(item:Item):boolean=>item.status==='保管中'&&!!data?.claims.some(c=>c.itemId===item.id&&c.status==='PENDING');
  const startReturn=(item:Item):void=>{
    if(!canReturn(item)){setError('返却できるのは所属窓口の拾得物だけです。');return;}
    setError('');setMessage('');setModal({kind:'return',item});
  };
  const itemCard=(item:Item):React.ReactElement=><button type="button" className="lf-item-card" key={item.id} onClick={()=>setModal({kind:'item',item})}><div className="lf-card-content"><div className="lf-card-meta"><span>#{item.id}</span><span className="lf-badge">{item.valuable?'非公開':'一覧に公開'}</span></div><h3>{item.title}</h3>{hasClaim(item)&&<span className="lf-badge">↩ 受取希望あり</span>}<p>色：{item.colors.join('・') || '不明'}</p><p className="lf-card-feature">特徴：{item.feature || '入力なし'}</p><div className="lf-card-footer"><span>保管場所：{item.window}</span><span>拾得日：{item.foundOn || '不明'}</span></div></div></button>;
  const requestSummary=(r:Request):string=>[categoryName(r.criteria.parent,r.criteria.category),r.criteria.colors.join('・'),getBuilding(r.criteria.building)?.name || getCampus(r.criteria.campus)?.name,r.criteria.dateFrom].filter(Boolean).join(' ／ ');
  const inScope=(window:string):boolean=>scope==='all'||window===data?.profile?.window;
  const windowScope=<Field label="保管窓口"><select aria-label="表示する保管窓口" value={scope} onChange={e=>setScope(e.target.value)}><option value="own">所属窓口{data?.profile?.window?`：${data.profile.window}`:'（未設定）'}</option><option value="all">全窓口</option></select></Field>;
  const claimReturned=(id:string):boolean=>!!data?.notices.some(n=>n.kind==='RETURN'&&n.claimId===id);
  let content:React.ReactNode;
  if(!data) content=<Empty title={error?'読み込めませんでした':'読み込み中…'}>{error&&<button onClick={()=>run(reload,'再読込しました。')}>再試行</button>}</Empty>;
  else if(!data.profile || page==='settings') content=<ProfileForm key={`${data.user.id}-${!!data.profile}`} data={data} service={service} run={run}/>;
  else if(page==='search') {
    const valuable=isValuable(criteria.parent,criteria.category);const results=data.items.filter(i=>matches(i,criteria));
    content=<><div className="lf-hero"><span className="lf-eyebrow">LOST & FOUND</span><h2>大切なものに、<br/>もう一度会えるように。</h2><p>大学の窓口に届いている落とし物を探せます。</p></div><div className="lf-search-bar"><Mark type="search"/><input aria-label="キーワードで探す" placeholder="傘、青い水筒など" value={criteria.query} onChange={e=>setCriteria({...criteria,query:e.target.value})}/><button type="button" className="lf-filter-button" aria-expanded={filters} onClick={()=>setFilters(!filters)}>条件 {filters?'−':'＋'}</button></div>{filters&&<section className="lf-panel"><Conditions value={criteria} onChange={setCriteria}/><button className="lf-text-button" onClick={()=>setCriteria(emptyCriteria())}>条件をクリア</button></section>}
      {valuable?<section className="lf-panel lf-valuable"><span className="lf-badge amber">公開しない品物について</span><h3>拾得物の一覧は公開していません</h3><p>なくした物の情報を登録すると、職員が必要に応じて確認し、該当しそうな物があればご案内します。</p><button className="lf-primary" onClick={()=>setModal({kind:'request'})}>なくした物を登録</button></section>:<><div className="lf-section-heading"><h2>届いているもの <span>{results.length}件</span></h2><span>拾得日の新しい順</span></div><div className="lf-item-grid">{results.sort((a,b)=>b.foundOn.localeCompare(a.foundOn)).map(itemCard)}</div>{!results.length&&<Empty title="この条件の落とし物はまだありません"><p>条件を広げるか、なくした物を登録してお待ちください。</p></Empty>}<section className="lf-follow"><div><h3>まだ見つかりませんか？</h3><p>なくした物を登録すると、後から届いた際にお知らせします。</p></div><button onClick={()=>setModal({kind:'request'})}>この条件を保存</button></section></>}</>;
  } else if(page==='register') content=<section className="lf-panel"><ItemForm key={registration} profile={data.profile} service={service} run={run} after={()=>setRegistration(n=>n+1)}/></section>;
  else if(page==='inventory') {
    const items=data.items.filter(i=>i.status==='保管中'&&inScope(i.window)&&(!claimsOnly||hasClaim(i))&&(kind==='all'||(kind==='valuable'?i.valuable:!i.valuable))&&matches(i,inventoryFilter)&&[i.id,i.title,i.window,i.place,i.feature,...i.colors].join(' ').includes(query));
    const group=CATEGORY_GROUPS.find(g=>g.code===inventoryFilter.parent);
    const active=!!(inventoryFilter.parent||inventoryFilter.campus||inventoryFilter.colors.length||kind!=='all'||claimsOnly);
    content=<><div className="lf-toolbar lf-inventory-toolbar">{windowScope}<Field label="受付番号・種類・特徴"><input aria-label="拾得物を検索" value={query} onChange={e=>setQuery(e.target.value)} placeholder="受付番号・種類・特徴"/></Field><button aria-expanded={filters} onClick={()=>setFilters(!filters)}>{filters?'絞り込みを閉じる':active?'絞り込み・適用中':'絞り込み'}</button></div>
      {filters&&<section className="lf-inventory-filters" aria-label="拾得物の絞り込み">
        <Field label="種類"><select value={inventoryFilter.parent} onChange={e=>setInventoryFilter({...inventoryFilter,parent:e.target.value,category:''})}><option value="">すべて</option>{CATEGORY_GROUPS.map(g=><option key={g.code} value={g.code}>{g.name}</option>)}</select></Field>
        <Field label="細かい種類"><select disabled={!group} value={inventoryFilter.category} onChange={e=>setInventoryFilter({...inventoryFilter,category:e.target.value})}><option value="">すべて</option>{group?.children.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="拾得キャンパス"><select value={inventoryFilter.campus} onChange={e=>setInventoryFilter({...inventoryFilter,campus:e.target.value})}><option value="">すべて</option>{CAMPUSES.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="色"><select value={inventoryFilter.colors[0] || ''} onChange={e=>setInventoryFilter({...inventoryFilter,colors:e.target.value?[e.target.value]:[]})}><option value="">すべて</option>{COLORS.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="学生への表示"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">すべて</option><option value="normal">一覧に公開</option><option value="valuable">非公開</option></select></Field>
        <Field label="受取希望"><select value={claimsOnly?'pending':'all'} onChange={e=>setClaimsOnly(e.target.value==='pending')}><option value="all">すべて</option><option value="pending">受取希望あり</option></select></Field>
        <button className="lf-text-button" onClick={()=>{setInventoryFilter(emptyCriteria());setKind('all');setQuery('');setClaimsOnly(false);}}>条件を解除</button>
      </section>}<div className="lf-item-grid">{items.map(itemCard)}</div>{!items.length&&<Empty title="該当する拾得物はありません"/>}</>;

  } else if(page==='requests') {
    const requests=data.requests.filter(r=>(!staff||r.status==='ACTIVE')&&[studentIdFromEmail(r.email),requestSummary(r),r.feature].join(' ').includes(query));
    content=<>{staff&&<><p className="lf-muted">紛失申告自体に公開区分はありません。公開品は自動照合し、非公開品は職員が確認します。</p><div className="lf-toolbar"><Field label="学籍番号・種類・特徴"><input aria-label="学生の紛失申告を検索" value={query} onChange={e=>setQuery(e.target.value)} placeholder="学籍番号・種類・特徴で検索"/></Field><p className="lf-muted">公開区分は拾得物側で判断します。申告を開くと、非公開・保管中の拾得物だけを照合できます。</p></div></>}
    <div className={staff?'lf-item-grid':'lf-stack'}>{requests.map(r=>staff?<button type="button" className="lf-item-card" key={r.id} onClick={()=>setModal({kind:'notify',request:r})}><div className="lf-card-meta"><span>#{r.id}</span><span className="lf-badge">非公開品と照合</span></div><h3>{categoryName(r.criteria.parent,r.criteria.category)}</h3><p>色：{r.criteria.colors.join('・')||'不明'}</p><p className="lf-card-feature">特徴：{r.feature||'入力なし'}</p><p>学籍番号：{studentIdFromEmail(r.email)}<br/>{r.email}</p><div className="lf-card-footer"><span>紛失時期：{r.criteria.dateFrom||'不明'}</span></div></button>:<article className="lf-panel" key={r.id}><h3>{requestSummary(r)}</h3><p>{r.feature||'特徴の入力なし'}</p><p>{r.status==='ACTIVE'?'通知待ち':r.status==='RESOLVED'?'解決済み':'取り下げ済み'}</p>{r.status==='ACTIVE'&&<div className="lf-actions"><button onClick={()=>setModal({kind:'request',request:r})}>編集</button><button onClick={()=>{if(window.confirm('このなくした物の登録を取り下げますか？'))run(()=>service.cancelRequest(r.id),'なくした物の登録を取り下げました。');}}>取り下げ</button></div>}</article>)}</div>
    {!requests.length&&<Empty title={staff?'学生の紛失申告はまだありません':'なくした物の登録はまだありません'}/>}{!staff&&<button className="lf-primary" onClick={()=>setModal({kind:'request'})}>なくした物を登録</button>}</>;
  } else if(page==='claims') {
    const claims=data.claims.filter(c=>c.status==='PENDING'&&data.items.some(i=>i.id===c.itemId&&i.status==='保管中')&&!claimReturned(c.id)&&studentIdFromEmail(c.email).includes(query));
    const returnToolbar=<div className="lf-toolbar"><Field label="学籍番号"><input aria-label="受け取り申し込みを検索" placeholder="学籍番号で検索" value={query} onChange={e=>setQuery(e.target.value)}/></Field></div>;
    content=<>{returnToolbar}<div className="lf-stack">{claims.map(c=><article className="lf-panel" key={c.id}><div className="lf-card-meta"><span className="lf-badge">{claimReturned(c.id)?'返却済み':c.status==='CANCELLED'?'取り下げ済み':'受付中'}</span></div><h3>{c.title}</h3><p>受取窓口：{c.window}</p>{staff?<p>学籍番号：{studentIdFromEmail(c.email)} · {c.email}</p>:<p className="lf-muted">窓口で学校メールをお伝えください。</p>}<p className="lf-muted">{stamp(c.createdAt)}</p>{c.status==='PENDING'&&!claimReturned(c.id)&&(staff?<button className="lf-primary" disabled={!data.items.some(i=>i.id===c.itemId&&canReturn(i))} onClick={()=>{const i=data.items.find(v=>v.id===c.itemId);if(i)startReturn(i);}}>本人確認・返却する</button>:<button onClick={()=>{if(window.confirm('受け取り申し込みを取り下げますか？'))run(()=>service.cancelClaim(c.id),'申出を取り下げました。');}}>申出を取り下げる</button>)}</article>)}</div>{!claims.length&&<Empty title="条件に合う事前申告はありません"/>}</>;
  } else if(page==='notices') {
    content=<><div className="lf-stack">{data.notices.slice().reverse().map(n=><article className="lf-panel" key={n.id}><span className="lf-eyebrow">{stamp(n.createdAt)}</span><h3>{n.title}</h3><p>{n.message}</p><p>受取窓口：{n.window}</p>{!staff&&n.kind==='MATCH'&&<button onClick={()=>{const i=data.items.find(x=>x.id===n.itemId);if(i)setModal({kind:'claim',item:i,requestId:n.requestId});else setError('現在は保管中ではありません。窓口へ確認してください。');}}>詳細・受け取り申し込み</button>}{!staff&&n.kind==='VALUABLE'&&<button className="lf-primary" onClick={()=>run(()=>service.createClaim(n.itemId,'',n.requestId),'返却を申し出ました。',()=>setPage('claims'))}>返却を申し出る</button>}</article>)}</div>{!data.notices.length&&<Empty title="新しいお知らせはありません"/>}{staff&&<section className="lf-panel"><h3>メール送信状況</h3><p className="lf-muted">テストではメールを実送信せず、送信待ちとして記録します。</p>{data.mail.map(m=><div className="lf-mail" key={m.id}><span>{m.email}<br/>{m.subject}</span><span className="lf-badge">{m.status==='SENT'?'送信済み':m.status==='ERROR'?'送信失敗':m.status==='PROCESSING'?'送信処理中':'送信待ち'}</span></div>)}</section>}</>;
  } else if(page==='history') {
    content=staff?<div className="lf-stack">{windowScope}{data.items.filter(i=>i.status!=='保管中'&&inScope(i.window)).map(i=><article className="lf-panel" key={i.id}><span className="lf-badge">{i.status}</span><h3>#{i.id} {i.title}</h3><p>{i.window} ／ {i.recipientEmail || '—'}</p><p className="lf-muted">{stamp(i.returnedAt || '')} · 担当 {i.returnedBy || '—'}</p>{i.status==='返却済み'&&<button onClick={()=>setModal({kind:'correct',item:i})}>返却記録を訂正</button>}</article>)}</div>:<div className="lf-stack">{data.notices.filter(n=>n.kind==='RETURN'||n.kind==='FINDER').map(n=><article className="lf-panel" key={n.id}><span className="lf-badge">{n.kind==='FINDER'?'届けた実績':'受取済み'}</span><h3>{n.title}</h3><p>{n.window} · {stamp(n.createdAt)}</p>{n.kind==='RETURN'&&<button onClick={()=>setModal({kind:'thanks',claimId:n.claimId})}>感謝の一言を残す（任意）</button>}</article>)}</div>;
    if(staff?!data.items.some(i=>i.status!=='保管中'):!data.notices.some(n=>n.kind==='RETURN'||n.kind==='FINDER'))content=<Empty title="返却履歴はまだありません"/>;
  } else if(page==='thanks') content=<><div className="lf-hero compact"><Mark type="thanks"/><h2>届けてくれて、ありがとう。</h2><p>学内で生まれた、小さな親切の記録。</p></div><div className="lf-item-grid">{data.thanks.slice().reverse().map(t=><blockquote className="lf-panel lf-thanks" key={t.id}><p>{t.message}</p><footer>匿名 · {stamp(t.createdAt)}</footer></blockquote>)}</div>{!data.thanks.length&&<Empty title="感謝の一言はまだありません"/>}</>;
  return <div className={`lf-app ${staff?'lf-staff':'lf-student'} ${collapsed?'lf-collapsed':''}`}>
    <datalist id="lf-windows">{WINDOWS.map(w=><option key={w} value={w}/>)}</datalist>
    {staff&&!collapsed&&<aside className="lf-sidebar"><div className="lf-sidebar-controls"><button className="lf-icon-button" aria-label="メニューを閉じる" aria-expanded={true} onClick={()=>setCollapsed(true)}>«</button></div><nav aria-label="職員メニュー">{pages.map(p=><button key={p} title={p==='requests'?'学生の紛失申告':labels[p]} aria-current={page===p?'page':undefined} onClick={()=>navigate(p)}><Mark type={p}/><span>{p==='requests'?'学生の紛失申告':labels[p]}</span></button>)}</nav><div className="lf-sidebar-bottom"><strong>{data?.profile?.window || '窓口未設定'}</strong><small>{data?.user.name}</small></div></aside>}
    <div className="lf-main"><header className="lf-topbar lf-compact-toolbar">{collapsed&&<button className="lf-icon-button" aria-label="メニューを開く" aria-expanded={false} onClick={()=>setCollapsed(false)}>☰</button>}<h1 ref={heading} tabIndex={-1}>{staff&&page==='requests'?'学生の紛失申告':labels[page]}</h1><div className="lf-top-actions">{page==='inventory'&&<button className="lf-primary" onClick={()=>navigate('register')}>＋ 拾得物を登録</button>}</div></header>
    <main>{!!data?.warnings?.length&&<div className="lf-error" role="alert">一部の保存データの形式を確認できません。職員に修正を依頼してください（{data.warnings.join('、')}）。</div>}{!modal&&error&&<div className="lf-error" role="alert">{error}{staff&&error.includes("再同期")&&<button disabled={busy} onClick={()=>run(()=>service.reconcile(),"公開・通知の反映を再実行しました。")}>公開・通知を再同期</button>}</div>}{message&&<div className="lf-success" role="status">{message}</div>}{busy&&<div className="lf-loading" role="status">保存・更新しています…</div>}<fieldset className="lf-content" disabled={busy}>{content}</fieldset></main>
    {!staff&&<nav className="lf-bottom-nav" aria-label="学生メニュー">{(['search','requests','claims','notices','history','thanks'] as Page[]).map(p=><button key={p} aria-current={page===p?'page':undefined} onClick={()=>navigate(p)}><Mark type={p}/><span>{p==='search'?'探す':p==='requests'?'なくした物':p==='claims'?'申出':p==='history'?'履歴':labels[p]}</span></button>)}</nav>}</div>
    {modal&&data&&<Modal title={modal.kind==='item'?'拾得物の詳細':modal.kind==='request'?'なくした物':modal.kind==='return'?'本人確認・返却記録':modal.kind==='correct'?'返却記録を訂正':modal.kind==='edit'?'拾得物を編集':modal.kind==='notify'?'紛失申告と非公開品を照合':modal.kind==='thanks'?'感謝の一言':'返却の申し出'} onClose={()=>{setError('');if(modal.kind==='return'){setPage('inventory');setModal({kind:'item',item:modal.item});}else close();}} busy={busy}>{error&&<div className="lf-error" role="alert">{error}</div>}<fieldset className="lf-content" disabled={busy}>
      {modal.kind==='item'&&<><div className="lf-card-meta"><span>受付番号 #{modal.item.id}</span><span className="lf-badge">{modal.item.status}</span></div><h3>{modal.item.title}</h3><ItemInfo item={modal.item}/>{staff?<>{modal.item.internalNote&&<p>内部メモ：{modal.item.internalNote}</p>}{modal.item.audit?.map((a,index)=><p className="lf-muted" key={index}>訂正履歴：{stamp(a.at)} ／ {a.reason} ／ 担当 {a.by} ／ 旧返却先 {a.recipient}</p>)}<div className="lf-actions"><button onClick={()=>setModal({kind:'edit',item:modal.item})}>編集する</button><button className="lf-primary" disabled={!canReturn(modal.item)} title={!canReturn(modal.item)?'返却できるのは所属窓口の拾得物だけです。':undefined} onClick={()=>{setQuery('');startReturn(modal.item);}}>返却する</button></div><details><summary>移管・処分</summary>{(['移管済み','処分済み'] as const).map(status=><button key={status} onClick={()=>{if(window.confirm(`${status}として保管を終了しますか？`))run(()=>service.closeItem(modal.item.id,status),'保管を終了しました。',close);}}>{status}にする</button>)}</details></>:<><p className="lf-muted">窓口で持ち主であることを確認します。</p><button className="lf-primary" onClick={()=>setModal({kind:'claim',item:modal.item})}>自分のものだと思う</button></>}</>}
      {modal.kind==='request'&&<RequestForm request={modal.request} criteria={criteria} service={service} run={run} after={()=>{close();setPage('requests');}}/>}
      {modal.kind==='claim'&&<><ItemInfo item={modal.item}/><ClaimForm item={modal.item} requestId={modal.requestId} data={data} service={service} run={run} after={afterClaim}/></>}
      {modal.kind==='return'&&<ReturnForm item={modal.item} claims={data.claims.filter(c=>c.itemId===modal.item.id&&c.status==='PENDING')} service={service} run={run} after={()=>{setModal(undefined);setPage('inventory');}}/>}
      {modal.kind==='correct'&&<CorrectForm item={modal.item} service={service} run={run} after={close}/>}
      {modal.kind==='edit'&&<ItemForm item={modal.item} profile={data.profile} service={service} run={run} after={close}/>}
      {modal.kind==='notify'&&<NotifyForm request={modal.request} data={data} service={service} run={run} after={close}/>}
      {modal.kind==='thanks'&&<ThanksForm claimId={modal.claimId} service={service} run={run} after={close}/>}
    </fieldset></Modal>}
  </div>;
}
