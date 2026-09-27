import * as React from 'react';
import { AdminAppService as AppService, AdminSnapshot } from './WorkflowService';
import { Snapshot, Criteria, Item, ItemInput, Request, Claim, Profile, COLORS, WINDOWS, emptyCriteria, today, categoryName, matches, studentIdFromEmail } from '../../src/webparts/lostFoundStudent/found-items/types/model';
import { CATEGORY_GROUPS } from '../../src/webparts/lostFoundStudent/found-items/utils/categories';
import { CAMPUSES, getCampus, getBuilding } from '../../src/webparts/lostFoundStudent/found-items/utils/locations';
import { RegistrationCategories, RegistrationColors, RegistrationLocations } from '../../src/webparts/lostFoundStudent/found-items/components/registration/RegistrationChoices';
import { Conditions } from '../../src/webparts/lostFoundStudent/found-items/components/student/StudentForms';
import '../../src/webparts/lostFoundStudent/styles/tailwind.generated.global.scss';

type Page = 'search'|'requests'|'claims'|'notices'|'history'|'settings'|'inventory'|'register';
type ModalState = {kind:'item';item:Item} | {kind:'delete';item:Item} | {kind:'request';request?:Request} | {kind:'claim';item:Item;requestId?:string} | {kind:'return';item:Item;claim?:Claim} | {kind:'bulk';action:'transfer';items:Item[]} | {kind:'correct';item:Item} | {kind:'edit';item:Item} | {kind:'notify';request:Request};
const stamp=(s:string):string=>s?new Date(s).toLocaleString('ja-JP',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const labels:Record<Page,string>={search:'落とし物を探す',requests:'なくした物',claims:'受取対応',notices:'お知らせ',history:'返却履歴',settings:'利用者設定',inventory:'保管中の拾得物',register:'拾得物を登録'};
function Mark({type}:{type:string}):React.ReactElement {
  const paths:Record<string,React.ReactNode>={search:<><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,requests:<><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></>,claims:<><path d="m4 12 5 5L20 6M3 4h6M3 8h4"/></>,notices:<><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zM10 20h4"/></>,history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2"/></>,settings:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/></>,inventory:<><path d="m3 7 9-4 9 4v13H3zM3 7h18M9 11h6"/></>,register:<path d="M12 3v18M3 12h18"/>};
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type] || paths.search}</svg>;
}
function Empty({title,children}:{title:string;children?:React.ReactNode}):React.ReactElement{return <div className="lf-empty"><Mark type="search"/><h3>{title}</h3>{children}</div>;}
function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}):React.ReactElement{return <label className="lf-field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
type RegistrationSelection=Pick<ItemInput,'parent'|'category'|'colors'|'campus'|'building'>;
function RegistrationFields({value,onChange}:{value:RegistrationSelection;onChange:(selection:RegistrationSelection)=>void}):React.ReactElement{
  return <div className="lf-fields">
    <RegistrationCategories value={value} onChange={selection=>onChange({...value,...selection})}/>
    <RegistrationColors value={value.colors} onChange={colors=>onChange({...value,colors})}/>
    <RegistrationLocations value={value} onChange={selection=>onChange({...value,...selection})}/>
  </div>;
}
function Modal({title,onClose,busy,children}:{title:string;onClose:()=>void;busy:boolean;children:React.ReactNode}):React.ReactElement {
  const ref=React.useRef<HTMLDivElement>(null); const closeRef=React.useRef(onClose);closeRef.current=onClose;
  React.useEffect(()=>{const last=document.activeElement as HTMLElement;const el=ref.current;el?.focus();const listener=(e:KeyboardEvent):void=>{if(e.key==='Escape'&&!busy)closeRef.current();if(e.key==='Tab'&&el){const all=Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'));const first=all[0],end=all[all.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===el)){e.preventDefault();end?.focus();}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',listener);return()=>{document.removeEventListener('keydown',listener);last?.focus();};},[busy]);
  return <div className="lf-overlay"><div className="lf-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><header><h2>{title}</h2><button type="button" className="lf-icon-button" aria-label="閉じる" disabled={busy} onClick={onClose}>×</button></header>{children}</div></div>;
}
function ItemInfo({item}:{item:Item}):React.ReactElement{return <dl className="lf-detail"><div><dt>色</dt><dd>{item.colors.join('・') || '不明'}</dd></div><div><dt>拾得場所</dt><dd>{item.place || getBuilding(item.building)?.name || getCampus(item.campus)?.name || '不明'}</dd></div><div><dt>拾得日</dt><dd>{item.foundOn || '不明'}</dd></div><div><dt>保管場所</dt><dd>{item.window}</dd></div>{item.feature&&<div><dt>特徴</dt><dd>{item.feature}</dd></div>}</dl>;}
function StaffHistoryTable({mode,data,scope,scopeControl,onOpen}:{mode:'history'|'notices';data:AdminSnapshot;scope:string;scopeControl:React.ReactNode;onOpen:(itemId:string)=>void}):React.ReactElement{
  const [query,setQuery]=React.useState('');const [requestedPage,setPage]=React.useState(1);
  React.useEffect(()=>setPage(1),[scope,query]);
  const headers=mode==='history'?['受付番号','品名','色','状態','拾得日']:['受付番号','品名','学籍番号','保管窓口','送信状況','送信日時'];
  const statuses:Record<string,string>={SENT:'送信済み',PENDING:'送信待ち',PROCESSING:'送信中',ERROR:'送信失敗'};
  const allRows=mode==='history'?data.items.filter(item=>item.status!=='保管中').map(item=>({key:item.id,itemId:item.id,window:item.window,error:'',cells:[item.id,item.title,item.colors.join('・')||'不明',item.status,item.foundOn||'不明']})):data.notificationHistory.map(row=>({key:row.id,itemId:row.itemId,window:row.window,error:row.error,cells:[row.itemId,row.title,row.studentId,row.window,statuses[row.status]||row.status,row.status==='SENT'?stamp(row.sentAt):'—']}));
  const rows=allRows.filter(row=>(scope==='all'||row.window===data.profile?.window)&&[...row.cells,row.window].join(' ').includes(query.trim()));
  const pages=Math.max(1,Math.ceil(rows.length/10)),page=Math.min(requestedPage,pages);
  const slots=pages<=7?Array.from({length:pages},(_,index)=>index+1):page<=4?[1,2,3,4,5,0,pages]:page>=pages-3?[1,0,pages-4,pages-3,pages-2,pages-1,pages]:[1,0,page-1,page,page+1,0,pages];
  const grid=mode==='history'?'lf-history-columns':'lf-notification-columns';
  return <><div className="lf-toolbar">{scopeControl}<Field label="受付番号・品名・学籍番号・保管窓口"><input type="search" aria-label="履歴を検索" value={query} onChange={event=>setQuery(event.target.value)}/></Field></div>
    <div className="lf-history-list"><div className={`lf-list-heading ${grid}`}>{headers.map(title=><span key={title}>{title}</span>)}</div>
      {rows.slice((page-1)*10,page*10).map(row=><div className="lf-inventory-row" key={row.key}><button type="button" className={`lf-row-content ${grid}`} aria-label={`受付番号 ${row.itemId} ${row.cells[1]} の詳細`} onClick={()=>onOpen(row.itemId)}>{row.cells.map((cell,index)=><span key={index} title={index===4&&row.error?row.error:cell}>{cell}</span>)}{mode==='history'&&scope==='all'&&<span className="lf-row-window">保管窓口：{row.window}</span>}</button></div>)}
      {!rows.length&&<Empty title={mode==='history'?'該当する返却履歴はありません':'該当するお知らせはありません'}/>}</div>
    <footer className="lf-history-footer"><span>全{rows.length}件中{rows.length?(page-1)*10+1:0}～{Math.min(page*10,rows.length)}件目を表示</span><nav aria-label="履歴のページ"><button aria-label="前のページ" disabled={page<=1} onClick={()=>setPage(page-1)}>‹</button>{slots.map((number,index)=><button key={index} disabled={!number} aria-label={number?`${number}ページ`:'省略'} aria-current={number===page?'page':undefined} onClick={()=>setPage(number)}>{number||'…'}</button>)}<button aria-label="次のページ" disabled={page>=pages} onClick={()=>setPage(page+1)}>›</button></nav></footer>
  </>;
}
function StaffDetailActions({item,service,run,canReturn,onEdit,onReceipt,onTransfer,onCorrect}:{item:Item;service:AppService;run:Run;canReturn:boolean;onEdit:()=>void;onReceipt:()=>void;onTransfer:()=>void;onCorrect:()=>void}):React.ReactElement{
  const [more,setMore]=React.useState(false),[note,setNote]=React.useState(item.internalNote||'');
  return <>{item.status==='保管中'&&<div className="lf-actions"><button onClick={onEdit}>編集する</button><button className="lf-primary" disabled={!canReturn} onClick={onReceipt}>受取対応を開く</button></div>}
    <button className="lf-detail-toggle" aria-expanded={more} onClick={()=>setMore(!more)}>その他の操作{more?'を閉じる':'を開く'}</button>
    {more&&<div className="lf-detail-more"><Field label="内部メモ（任意・学生には表示しません）"><textarea rows={3} value={note} onChange={event=>setNote(event.target.value)}/></Field><button className="lf-primary" onClick={()=>run(()=>service.saveItemNote(item.id,note),'内部情報を保存しました。')}>内部情報を保存</button>
      {item.status==='保管中'&&<div className="lf-detail-secondary"><span>移管</span><button onClick={onTransfer}>移管する</button></div>}
      {item.status==='返却済み'&&<div className="lf-detail-secondary"><span>返却取消</span><button onClick={onCorrect}>返却記録を訂正</button></div>}
    </div>}
  </>;
}
function ProfileForm({data,service,run}:{data:Snapshot;service:AppService;run:Run}):React.ReactElement{
  const [email,setEmail]=React.useState(data.profile?.email || data.user.email);
  const [window,setWindow]=React.useState(data.profile?.window || '');
  return <form className="lf-panel lf-form" onSubmit={e=>{e.preventDefault();run(()=>service.saveProfile({email,window}),'利用者情報を保存しました。');}}><h2>{data.profile?'利用者設定':'はじめに利用者情報を登録'}</h2><p className="lf-muted">{data.user.role==='staff'?'ここで設定した保管窓口を、新規登録の初期値にします。':'学校メールの「@」より前を学籍番号として使用します。パスワードは大学のMicrosoftサインインで管理され、この画面では保存しません。'}</p><Field label={data.user.role==='staff'?'職員メール':'学校メール（学籍番号付き・必須）'} hint={data.user.role==='student'?`対象：${service.domains.join(' / ')}`:undefined}><input required type="email" value={email} readOnly={data.user.role==='staff'} autoComplete="email" onChange={e=>setEmail(e.target.value)}/></Field>{data.user.role==='staff'&&<Field label="いつもの保管窓口"><input list="lf-windows" required value={window} onChange={e=>setWindow(e.target.value)} placeholder="農学部事務室"/></Field>}<button className="lf-primary" type="submit">保存する</button></form>;
}
type Run=(work:()=>Promise<void>,message:string,after?:()=>void)=>void;
function ItemForm({item,profile,service,run,after}:{item?:Item;profile?:Profile;service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [criteria,setCriteria]=React.useState<RegistrationSelection>({parent:item?.parent || '',category:item?.category || '',colors:item?.colors || [],campus:item?.campus || '',building:item?.building || ''});
  const [date,setDate]=React.useState(item?.foundOn ?? today());const [place,setPlace]=React.useState(item?.place || '');
  const [window,setWindow]=React.useState(item?.window || profile?.window || '');const [feature,setFeature]=React.useState(item?.feature || '');
  const [valuable,setValuable]=React.useState(item?.valuable || false);const [finder,setFinder]=React.useState(item?.finderEmail?.split('@')[0] || '');const [note,setNote]=React.useState(item?.internalNote || '');
  const finderDomain=item?.studentSubmissionKey&&item.finderEmail?'@'+item.finderEmail.split('@')[1]:'@stu.kobe-u.ac.jp';
  return <form className="lf-form lf-item-form" onSubmit={e=>{e.preventDefault();const input:ItemInput={parent:criteria.parent,category:criteria.category,colors:criteria.colors,campus:criteria.campus,building:criteria.building,title:categoryName(criteria.parent,criteria.category),foundOn:date,place:place.trim() || getBuilding(criteria.building)?.name || getCampus(criteria.campus)?.name || '',window:window.trim(),feature,valuable,finderEmail:item?.studentSubmissionKey?(item.finderEmail || ''):(finder.trim()?finder.trim().toLowerCase()+'@stu.kobe-u.ac.jp':''),internalNote:note};run(()=>service.saveItem(input,item?.id),item?'拾得物を更新しました。':'拾得物を登録しました。',after);}}>
    <RegistrationFields value={criteria} onChange={setCriteria}/>
    <Field label="拾得場所の補足（任意）"><input value={place} maxLength={200} onChange={e=>setPlace(e.target.value)} placeholder="食堂入口付近など"/></Field>
    <div className="lf-grid2"><Field label="拾得日（不明なら空欄）"><input type="date" max={today()} value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="保管場所（必須）" hint="新規登録時は職員設定の窓口が初期値になります。"><input required list="lf-windows" value={window} maxLength={150} onChange={e=>setWindow(e.target.value)}/></Field></div>
    <Field label="特徴（任意）" hint="通常品では学生にも表示します。本人確認用の情報や個人情報は内部メモへ。"><textarea rows={3} maxLength={255} value={feature} onChange={e=>setFeature(e.target.value)} placeholder="白い縁取り、木製の持ち手など"/></Field>
    <label className="lf-check"><input type="checkbox" checked={!valuable} onChange={e=>setValuable(!e.target.checked)}/>学生一覧に公開する（品物の種類にかかわらず職員が判断）</label>
    {valuable&&<p className="lf-info">この拾得物は学生の一覧・詳細・自動通知に表示しません。</p>}
    <Field label="拾得者の学校メール（任意）" hint={item?.studentSubmissionKey?'学生本人のお礼メールの受取設定に従います。登録者メールは変更できません。':'お礼を希望する場合だけ学籍番号を入力。未入力でも登録できます。学生一覧には公開しません。'}><span className="lf-finder-email"><input aria-label="拾得者の学校メール（任意）" type="text" maxLength={64} placeholder="学籍番号" autoCapitalize="none" spellCheck={false} value={finder} readOnly={!!item?.studentSubmissionKey} onChange={e=>setFinder(e.target.value)}/><span className="lf-finder-domain">{finderDomain}</span></span></Field>
    <details><summary>内部メモ（任意）</summary><Field label="内部メモ"><textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></Field></details>
    <button className="lf-primary" type="submit" disabled={!criteria.parent||!criteria.category||!criteria.campus||!window.trim()}>{item?'変更を保存':'拾得物を登録'}</button>
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
  const recipient=claims.length===1?claims[0].id:'walkin';
  const [email,setEmail]=React.useState('');const [confirmed,setConfirmed]=React.useState(false);
  const claim=claims.find(c=>c.id===recipient);const ready=recipient==='walkin'||!!claim;
  return <form className="lf-form" onSubmit={e=>{e.preventDefault();if(ready)run(()=>service.returnItem(item.id,claim?.email||email,claim?.id||'',confirmed),'返却を記録しました。',after);}}>
    <div className="lf-info"><strong>返却する拾得物：#{item.id} {item.title}</strong><br/>色：{item.colors.join('・')||'不明'}</div>
    <Field label="返却する相手"><select disabled value={recipient}>
      <option value="" disabled>申告を選択してください</option>
      {claims.map(c=><option key={c.id} value={c.id}>{studentIdFromEmail(c.email)} / {c.email}</option>)}
      <option value="walkin">事前申告なしで受け付ける</option>
    </select></Field>
    {ready&&<><Field label="返却先の学校メール（学籍番号付き）"><input required type="email" value={claim?.email||email} readOnly={!!claim} onChange={e=>{setEmail(e.target.value);setConfirmed(false);}}/></Field>
    <div className="lf-return-comparison"><Field label="拾得物の特徴"><div className="lf-quote">{item.feature||'入力なし'}</div></Field><Field label="学生が申告した特徴"><div className="lf-quote">{claim?.feature||'事前入力なし。窓口で確認してください。'}</div></Field></div></>}
    <label className="lf-check"><input required type="checkbox" disabled={!ready} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>現物と申告内容を確認し、本人確認を完了しました</label>
    <button type="submit" className="lf-primary" disabled={!ready||!confirmed}>返却を完了する</button>
  </form>;
}
function BulkActionForm({items,service,run,after}:{items:Item[];service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [destination,setDestination]=React.useState('');const [confirmed,setConfirmed]=React.useState(false);
  return <form className="lf-form" onSubmit={event=>{event.preventDefault();run(()=>service.transferItems(items.map(item=>item.id),destination,confirmed),`${items.length}件を移管しました。`,after);}}>
    <div className="lf-info"><strong>対象：{items.length}件</strong><br/>{items.map(item=>`#${item.id} ${item.title}`).join('、')}</div>
    <Field label="移管先"><input required value={destination} maxLength={150} onChange={event=>{setDestination(event.target.value);setConfirmed(false);}} placeholder="例：六甲台キャンパス守衛室"/></Field>
    <p className="lf-muted">同じ移管先へ渡す品物をまとめて処理します。移管先・日時・担当者を記録します。</p>
    <label className="lf-check"><input required type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{items.length}件の現物と移管先を確認しました</label>
    <button type="submit" className="lf-primary" disabled={!confirmed}>{items.length}件を移管</button>
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
export default function StaffHarnessApp({service}:{service:AppService}):React.ReactElement {
  const [data,setData]=React.useState<AdminSnapshot>();const [page,setPage]=React.useState<Page>('search');const [criteria,setCriteria]=React.useState(emptyCriteria);const [filters,setFilters]=React.useState(false);
  const [inventoryFilter,setInventoryFilter]=React.useState(emptyCriteria);const [scope,setScope]=React.useState('own');const [collapsed,setCollapsed]=React.useState(false);const [busy,setBusy]=React.useState(false);const [error,setError]=React.useState('');const [message,setMessage]=React.useState('');const [modal,setModal]=React.useState<ModalState>();const [query,setQuery]=React.useState('');const [kind,setKind]=React.useState('all');const [registration,setRegistration]=React.useState(0);
  const [claimsOnly,setClaimsOnly]=React.useState(false);const [bulkMode,setBulkMode]=React.useState(false);const [selectedIds,setSelectedIds]=React.useState<string[]>([]);
  const [receiptItemId,setReceiptItemId]=React.useState('');const [walkin,setWalkin]=React.useState(false);
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
  const navigate=(p:Page):void=>{setPage(p);if(p==='inventory'||p==='claims')setScope('own');setBulkMode(false);setSelectedIds([]);reload().catch(e=>setError(String(e.message||e)));setQuery('');setKind('all');setError('');setMessage('');window.setTimeout(()=>heading.current?.focus(),0);};
  const staff=data?.user.role==='staff';
  const pages:Page[]=staff?['inventory','requests','claims','history','notices','settings']:['search','requests','claims','notices','history','settings'];
  const close=():void=>setModal(undefined);
  const afterClaim=():void=>{close();setPage('claims');};
  const canReturn=(item:Item):boolean=>!!data?.profile?.window && item.window===data.profile.window && item.status==='保管中';
  const hasClaim=(item:Item):boolean=>item.status==='保管中'&&!!data?.claims.some(c=>c.itemId===item.id&&c.status==='PENDING');
  const startReturn=(item:Item,claim?:Claim):void=>{
    if(!canReturn(item)){setError('返却できるのは所属窓口の拾得物だけです。');return;}
    setError('');setMessage('');setModal({kind:'return',item,claim});
  };
  const itemCard=(item:Item):React.ReactElement=>{const selectable=!!staff&&page==='inventory'&&bulkMode;const selected=selectedIds.includes(item.id);return <div className="lf-item-card" key={item.id}>{selectable&&<label className="lf-check"><input type="checkbox" checked={selected} disabled={!canReturn(item)} onChange={event=>setSelectedIds(event.target.checked?[...selectedIds,item.id]:selectedIds.filter(id=>id!==item.id))}/>選択</label>}<button type="button" className="lf-card-content" onClick={()=>setModal({kind:'item',item})}><div className="lf-card-meta"><span>#{item.id}</span><span className="lf-badge">{item.valuable?'非公開':'一覧に公開'}</span></div><h3>{item.title}</h3>{hasClaim(item)&&<span className="lf-badge">↩ 受取希望あり</span>}<p>色：{item.colors.join('・') || '不明'}</p><p className="lf-card-feature">特徴：{item.feature || '入力なし'}</p><div className="lf-card-footer"><span>保管場所：{item.window}</span><span>拾得日：{item.foundOn || '不明'}</span></div></button></div>;};
  const requestSummary=(r:Request):string=>[categoryName(r.criteria.parent,r.criteria.category),r.criteria.colors.join('・'),getBuilding(r.criteria.building)?.name || r.criteria.campuses.map(code=>getCampus(code)?.name).filter(Boolean).join('・'),r.criteria.dateFrom].filter(Boolean).join(' ／ ');
  const inScope=(window:string):boolean=>scope==='all'||window===data?.profile?.window;
  const windowScope=<Field label="保管窓口"><select aria-label="表示する保管窓口" value={scope} onChange={e=>setScope(e.target.value)}><option value="own">所属窓口{data?.profile?.window?`：${data.profile.window}`:'（未設定）'}</option><option value="all">全窓口</option></select></Field>;
  let content:React.ReactNode;
  if(!data) content=<Empty title={error?'読み込めませんでした':'読み込み中…'}>{error&&<button onClick={()=>run(reload,'再読込しました。')}>再試行</button>}</Empty>;
  else if(!data.profile || page==='settings') content=<ProfileForm key={`${data.user.id}-${!!data.profile}`} data={data} service={service} run={run}/>;
  else if(page==='search') {
    const results=data.items.filter(i=>matches(i,criteria));
    content=<><div className="lf-hero"><span className="lf-eyebrow">LOST & FOUND</span><h2>大切なものに、<br/>もう一度会えるように。</h2><p>大学の窓口に届いている落とし物を探せます。</p></div><div className="lf-search-bar"><Mark type="search"/><input aria-label="キーワードで探す" placeholder="傘、青い水筒など" value={criteria.query} onChange={e=>setCriteria({...criteria,query:e.target.value})}/><button type="button" className="lf-filter-button" aria-expanded={filters} onClick={()=>setFilters(!filters)}>条件 {filters?'−':'＋'}</button></div>{filters&&<section className="lf-panel"><Conditions value={criteria} onChange={setCriteria}/><button className="lf-text-button" onClick={()=>setCriteria(emptyCriteria())}>条件をクリア</button></section>}
      <div className="lf-section-heading"><h2>届いているもの <span>{results.length}件</span></h2><span>拾得日の新しい順</span></div><div className="lf-item-grid">{results.sort((a,b)=>b.foundOn.localeCompare(a.foundOn)).map(itemCard)}</div>{!results.length&&<Empty title="この条件の落とし物はまだありません"><p>条件を広げるか、なくした物を登録してお待ちください。</p></Empty>}<section className="lf-follow"><div><h3>まだ見つかりませんか？</h3><p>なくした物を登録すると、後から届いた際にお知らせします。</p></div><button onClick={()=>setModal({kind:'request'})}>この条件を保存</button></section></>;
  } else if(page==='register') content=<section className="lf-panel"><ItemForm key={registration} profile={data.profile} service={service} run={run} after={()=>setRegistration(n=>n+1)}/></section>;
  else if(page==='inventory') {
    const items=data.items.filter(i=>i.status==='保管中'&&inScope(i.window)&&(!claimsOnly||hasClaim(i))&&(kind==='all'||(kind==='valuable'?i.valuable:!i.valuable))&&matches(i,inventoryFilter)&&[i.id,i.title,i.window,i.place,i.feature,...i.colors].join(' ').includes(query));
    const group=CATEGORY_GROUPS.find(g=>g.code===inventoryFilter.parent);
    const active=!!(inventoryFilter.parent||inventoryFilter.campuses.length||inventoryFilter.colors.length||kind!=='all'||claimsOnly);
    const selected=items.filter(item=>selectedIds.includes(item.id));
    content=<><div className="lf-toolbar lf-inventory-toolbar">{windowScope}<Field label="受付番号・種類・特徴"><input aria-label="拾得物を検索" value={query} onChange={e=>{setQuery(e.target.value);setSelectedIds([]);}} placeholder="受付番号・種類・特徴"/></Field><button aria-expanded={filters} onClick={()=>setFilters(!filters)}>{filters?'絞り込みを閉じる':active?'絞り込み・適用中':'絞り込み'}</button></div>
      {bulkMode&&<div className="lf-toolbar" aria-label="選択した拾得物の操作"><strong>{selected.length}件を選択中</strong><button disabled={!selected.length} onClick={()=>setSelectedIds([])}>選択解除</button><button disabled={!selected.length} onClick={()=>setModal({kind:'bulk',action:'transfer',items:selected})}>移管</button></div>}
      {filters&&<section className="lf-inventory-filters" aria-label="拾得物の絞り込み">
        <Field label="種類"><select value={inventoryFilter.parent} onChange={e=>setInventoryFilter({...inventoryFilter,parent:e.target.value,category:''})}><option value="">すべて</option>{CATEGORY_GROUPS.map(g=><option key={g.code} value={g.code}>{g.name}</option>)}</select></Field>
        <Field label="細かい種類"><select disabled={!group} value={inventoryFilter.category} onChange={e=>setInventoryFilter({...inventoryFilter,category:e.target.value})}><option value="">すべて</option>{group?.children.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="拾得キャンパス"><select value={inventoryFilter.campuses[0] || ''} onChange={e=>setInventoryFilter({...inventoryFilter,campuses:e.target.value?[e.target.value]:[]})}><option value="">すべて</option>{CAMPUSES.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="色"><select value={inventoryFilter.colors[0] || ''} onChange={e=>setInventoryFilter({...inventoryFilter,colors:e.target.value?[e.target.value]:[]})}><option value="">すべて</option>{COLORS.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
        <Field label="学生への表示"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">すべて</option><option value="normal">一覧に公開</option><option value="valuable">非公開</option></select></Field>
        <Field label="受取希望"><select value={claimsOnly?'pending':'all'} onChange={e=>setClaimsOnly(e.target.value==='pending')}><option value="all">すべて</option><option value="pending">受取希望あり</option></select></Field>
        <button className="lf-text-button" onClick={()=>{setInventoryFilter(emptyCriteria());setKind('all');setQuery('');setClaimsOnly(false);}}>条件を解除</button>
      </section>}<div className={`lf-inventory-list ${bulkMode?'lf-selecting':''}`}>
        <div className="lf-list-heading lf-inventory-columns">{['受付番号','品名','色','公開状態','拾得日','受取希望','操作'].map(label=><span key={label}>{label}</span>)}</div>
        {items.map(item=><article className="lf-item-card lf-inventory-row" key={item.id}>
          {bulkMode&&<input type="checkbox" className="lf-row-check" aria-label={`受付番号 ${item.id} を選択`} checked={selectedIds.includes(item.id)} disabled={!canReturn(item)} onChange={e=>setSelectedIds(e.target.checked?[...selectedIds,item.id]:selectedIds.filter(id=>id!==item.id))}/>}
          <button type="button" className="lf-inventory-columns lf-row-content" onClick={()=>setModal({kind:'item',item})}>
            <span>{item.id}</span><h3>{item.title}</h3><span>{item.colors.join('・')||'不明'}</span><span>{item.valuable?'非公開':'公開'}</span><span>{item.foundOn||'不明'}</span><span className="lf-row-claim">{hasClaim(item)?'希望あり':'—'}</span><span aria-hidden="true"/>
            {scope==='all'&&<span className="lf-row-window">保管窓口：{item.window}</span>}
          </button>
          <div className="lf-row-actions">
            <button type="button" aria-label={`受付番号 ${item.id} を編集`} title="編集" disabled={!canReturn(item)} onClick={()=>setModal({kind:'edit',item})}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15z"/></svg></button>
            <button type="button" className="lf-delete-action" aria-label={`受付番号 ${item.id} を削除`} title="削除" disabled={!canReturn(item)} onClick={()=>setModal({kind:'delete',item})}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg></button>
          </div>
        </article>)}
      </div>{!items.length&&<Empty title="該当する拾得物はありません"/>}</>;

  } else if(page==='requests') {
    const requests=data.requests.filter(r=>(!staff||r.status==='ACTIVE')&&[studentIdFromEmail(r.email),requestSummary(r),r.feature].join(' ').includes(query));
    content=<>{staff&&<><p className="lf-muted">紛失申告自体に公開区分はありません。公開品は自動照合し、非公開品は職員が確認します。</p><div className="lf-toolbar"><Field label="学籍番号・種類・特徴"><input aria-label="学生の紛失申告を検索" value={query} onChange={e=>setQuery(e.target.value)} placeholder="学籍番号・種類・特徴で検索"/></Field><p className="lf-muted">公開区分は拾得物側で判断します。申告を開くと、非公開・保管中の拾得物だけを照合できます。</p></div></>}
    <div className={staff?'lf-item-grid':'lf-stack'}>{requests.map(r=>staff?<button type="button" className="lf-item-card" key={r.id} onClick={()=>setModal({kind:'notify',request:r})}><div className="lf-card-meta"><span>#{r.id}</span><span className="lf-badge">非公開品と照合</span></div><h3>{categoryName(r.criteria.parent,r.criteria.category)}</h3><p>色：{r.criteria.colors.join('・')||'不明'}</p><p className="lf-card-feature">特徴：{r.feature||'入力なし'}</p><p>学籍番号：{studentIdFromEmail(r.email)}<br/>{r.email}</p><div className="lf-card-footer"><span>紛失時期：{r.criteria.dateFrom||'不明'}</span></div></button>:<article className="lf-panel" key={r.id}><h3>{requestSummary(r)}</h3><p>{r.feature||'特徴の入力なし'}</p><p>{r.status==='ACTIVE'?'通知待ち':r.status==='RESOLVED'?'解決済み':'取り下げ済み'}</p>{r.status==='ACTIVE'&&<div className="lf-actions"><button onClick={()=>setModal({kind:'request',request:r})}>編集</button><button onClick={()=>{if(window.confirm('このなくした物の登録を取り下げますか？'))run(()=>service.cancelRequest(r.id),'なくした物の登録を取り下げました。');}}>取り下げ</button></div>}</article>)}</div>
    {!requests.length&&<Empty title={staff?'学生の紛失申告はまだありません':'なくした物の登録はまだありません'}/>}{!staff&&<button className="lf-primary" onClick={()=>setModal({kind:'request'})}>なくした物を登録</button>}</>;
  } else if(page==='claims') {
    const receipts=data.claims.flatMap(claim=>{
      const item=data.items.find(candidate=>candidate.id===claim.itemId&&candidate.status==='保管中');
      return item&&claim.status==='PENDING'&&inScope(item.window)&&(!receiptItemId||claim.itemId===receiptItemId)&&[claim.email,item.title,item.feature,claim.itemId].join(' ').includes(query)?[{claim,item}]:[];
    });
    const walkinItems=data.items.filter(item=>canReturn(item)&&(!receiptItemId||item.id===receiptItemId));
    content=<><div className="lf-toolbar">{windowScope}<Field label="学籍番号・メール・受付番号・品名・特徴"><input aria-label="受け取り申し込みを検索" value={query} onChange={e=>setQuery(e.target.value)}/></Field><button onClick={()=>{setWalkin(!walkin);setReceiptItemId('');}}>{walkin?'申出のある方':'申出なしで返却'}</button>{receiptItemId&&<button onClick={()=>setReceiptItemId('')}>対象の絞り込みを解除</button>}</div>
      {walkin?<div className="lf-stack">{walkinItems.map(item=><article className="lf-panel" key={item.id}><h3>#{item.id} {item.title}</h3><p>色：{item.colors.join('・')||'不明'} ／ 拾得日：{item.foundOn}</p><p>拾得場所：{item.place||'入力なし'} ／ 特徴：{item.feature||'入力なし'}</p><button onClick={()=>startReturn(item)}>本人確認・返却</button></article>)}</div>:<div className="lf-receipt-list">
        <div className="lf-list-heading lf-receipt-columns"><span>受付番号</span><span>品名</span><span>申出者</span><span>操作</span></div>
        {receipts.map(({claim,item})=><article className="lf-receipt-row" key={claim.id}>
          <div className="lf-receipt-columns lf-row-content"><span>{claim.itemId}</span><div className="lf-receipt-item"><h3 title={item.title}>{item.title}</h3><p title={`${item.colors.join('・')||'不明'}｜${item.feature||'特徴の入力なし'}`}>{item.colors.join('・')||'不明'}｜{item.feature||'特徴の入力なし'}</p></div><span>{studentIdFromEmail(claim.email)}<br/><small>{claim.email}</small></span><button onClick={()=>startReturn(item,claim)}>本人確認・返却</button></div>
        </article>)}
      </div>}
      {!walkin&&!receipts.length&&<Empty title="該当する受取申出はありません"/>}</>;
  } else if(page==='notices') {
    content=staff?<StaffHistoryTable key="notices" mode="notices" data={data} scope={scope} scopeControl={windowScope} onOpen={itemId=>{const item=data.items.find(row=>row.id===itemId);if(item)setModal({kind:'item',item});else setError('この拾得物は削除されたか、アクセスできません。');}}/>:<><div className="lf-stack">{data.notices.slice().reverse().map(n=><article className="lf-panel" key={n.id}><span className="lf-eyebrow">{stamp(n.createdAt)}</span><h3>{n.title}</h3><p>{n.message}</p><p>受取窓口：{n.window}</p>{n.kind==='MATCH'&&<button onClick={()=>{const i=data.items.find(x=>x.id===n.itemId);if(i)setModal({kind:'claim',item:i,requestId:n.requestId});else setError('現在は保管中ではありません。窓口へ確認してください。');}}>詳細・受け取り申し込み</button>}{n.kind==='VALUABLE'&&<button className="lf-primary" onClick={()=>run(()=>service.createClaim(n.itemId,'',n.requestId),'返却を申し出ました。',()=>setPage('claims'))}>返却を申し出る</button>}</article>)}</div>{!data.notices.length&&<Empty title="新しいお知らせはありません"/>}</>;
  } else if(page==='history') {
    const returnedClaims=data.claims.filter(claim=>claim.status==='RETURNED');
    content=staff?<StaffHistoryTable key="history" mode="history" data={data} scope={scope} scopeControl={windowScope} onOpen={itemId=>{const item=data.items.find(row=>row.id===itemId);if(item)setModal({kind:'item',item});}}/>:<div className="lf-stack">{returnedClaims.map(claim=><article className="lf-panel" key={claim.id}><span className="lf-badge">受取済み</span><h3>{claim.title}</h3><p>{claim.window} · {stamp(claim.returnedAt)}</p></article>)}</div>;
    if(!staff&&!returnedClaims.length)content=<Empty title="返却履歴はまだありません"/>;
  }
  return <div className={`lf-app ${staff?'lf-staff':'lf-student'} ${collapsed?'lf-collapsed':''}`}>
    <datalist id="lf-windows">{WINDOWS.map(w=><option key={w} value={w}/>)}</datalist>
    {staff&&!collapsed&&<aside className="lf-sidebar"><div className="lf-sidebar-controls"><button className="lf-icon-button" aria-label="メニューを閉じる" aria-expanded={true} onClick={()=>setCollapsed(true)}>«</button></div><nav aria-label="職員メニュー">{pages.map(p=><button key={p} title={p==='requests'?'学生の紛失申告':labels[p]} aria-current={page===p?'page':undefined} onClick={()=>{setReceiptItemId('');setWalkin(false);navigate(p);}}><Mark type={p}/><span>{p==='requests'?'学生の紛失申告':labels[p]}</span></button>)}</nav><div className="lf-sidebar-bottom"><strong>{data?.profile?.window || '窓口未設定'}</strong><small>{data?.user.name}</small></div></aside>}
    <div className="lf-main"><header className="lf-topbar lf-compact-toolbar">{collapsed&&<button className="lf-icon-button" aria-label="メニューを開く" aria-expanded={false} onClick={()=>setCollapsed(false)}>☰</button>}<h1 ref={heading} tabIndex={-1}>{staff&&page==='requests'?'学生の紛失申告':labels[page]}</h1><div className="lf-top-actions">{page==='inventory'&&<><button onClick={()=>{setBulkMode(!bulkMode);setSelectedIds([]);setScope('own');}}>{bulkMode?'選択を終了':'まとめて操作'}</button><button className="lf-primary" onClick={()=>navigate('register')}>＋ 拾得物を登録</button></>}</div></header>
    <main>{!!data?.warnings?.length&&<div className="lf-error" role="alert">一部の保存データの形式を確認できません。職員に修正を依頼してください（{data.warnings.join('、')}）。</div>}{!modal&&error&&<div className="lf-error" role="alert">{error}{staff&&error.includes("再同期")&&<button disabled={busy} onClick={()=>run(()=>service.reconcile(),"公開・通知の反映を再実行しました。")}>公開・通知を再同期</button>}</div>}{message&&<div className="lf-success" role="status">{message}</div>}{busy&&<div className="lf-loading" role="status">保存・更新しています…</div>}<fieldset className="lf-content" disabled={busy}>{content}</fieldset></main>
    {!staff&&<nav className="lf-bottom-nav" aria-label="学生メニュー">{(['search','requests','claims','notices','history'] as Page[]).map(p=><button key={p} aria-current={page===p?'page':undefined} onClick={()=>navigate(p)}><Mark type={p}/><span>{p==='search'?'探す':p==='requests'?'なくした物':p==='claims'?'申出':p==='history'?'履歴':labels[p]}</span></button>)}</nav>}</div>
    {modal&&data&&<Modal title={modal.kind==='item'?'拾得物の詳細':modal.kind==='delete'?'拾得物を削除':modal.kind==='request'?'なくした物':modal.kind==='return'?'本人確認・返却記録':modal.kind==='bulk'?'まとめて移管':modal.kind==='correct'?'返却記録を訂正':modal.kind==='edit'?'拾得物を編集':modal.kind==='notify'?'紛失申告と非公開品を照合':'返却の申し出'} onClose={()=>{setError('');close();}} busy={busy}>{error&&<div className="lf-error" role="alert">{error}</div>}<fieldset className="lf-content" disabled={busy}>
      {modal.kind==='item'&&<><div className="lf-card-meta"><span>受付番号 #{modal.item.id}</span><span className="lf-badge">{modal.item.status}</span></div><h3>{modal.item.title}</h3><ItemInfo item={modal.item}/>{staff?<>{modal.item.status==='返却済み'&&<p>返却先：{modal.item.recipientEmail||'—'} ／ {stamp(modal.item.returnedAt||'')} ／ 担当：{modal.item.returnedBy||'—'}</p>}{modal.item.audit?.map((a,index)=><p className="lf-muted" key={index}>訂正履歴：{stamp(a.at)} ／ {a.reason} ／ 担当 {a.by} ／ 旧返却先 {a.recipient}</p>)}<StaffDetailActions key={modal.item.id} item={modal.item} service={service} run={run} canReturn={canReturn(modal.item)} onEdit={()=>setModal({kind:'edit',item:modal.item})} onTransfer={()=>setModal({kind:'bulk',action:'transfer',items:[modal.item]})} onCorrect={()=>setModal({kind:'correct',item:modal.item})} onReceipt={()=>{setReceiptItemId(modal.item.id);setWalkin(false);setModal(undefined);navigate('claims');}}/></>:<><p className="lf-muted">窓口で持ち主であることを確認します。</p><button className="lf-primary" onClick={()=>setModal({kind:'claim',item:modal.item})}>自分のものだと思う</button></>}</>}
      {modal.kind==='request'&&<RequestForm request={modal.request} criteria={criteria} service={service} run={run} after={()=>{close();setPage('requests');}}/>}
      {modal.kind==='claim'&&<><ItemInfo item={modal.item}/><ClaimForm item={modal.item} requestId={modal.requestId} data={data} service={service} run={run} after={afterClaim}/></>}
      {modal.kind==='return'&&<ReturnForm item={modal.item} claims={modal.claim?[modal.claim]:[]} service={service} run={run} after={()=>{setModal(undefined);setPage('claims');}}/>}
      {modal.kind==='bulk'&&<BulkActionForm items={modal.items} service={service} run={run} after={()=>{setModal(undefined);setBulkMode(false);setSelectedIds([]);setPage('inventory');}}/>}
      {modal.kind==='correct'&&<CorrectForm item={modal.item} service={service} run={run} after={close}/>}
      {modal.kind==='edit'&&<ItemForm item={modal.item} profile={data.profile} service={service} run={run} after={close}/>}
      {modal.kind==='delete'&&<><h3>受付番号 {modal.item.id}　{modal.item.title}</h3><p>この登録を削除しますか？学生向けの公開一覧からも取り除きます。</p><p>申出・通知・返却履歴がある品物は削除できません。</p><div className="lf-actions"><button onClick={close}>キャンセル</button><button className="lf-delete-confirm" onClick={()=>run(()=>service.deleteItem(modal.item.id),'拾得物を削除しました。',()=>{setSelectedIds([]);close();})}>削除する</button></div></>}
      {modal.kind==='notify'&&<NotifyForm request={modal.request} data={data} service={service} run={run} after={close}/>}
    </fieldset></Modal>}
  </div>;
}
