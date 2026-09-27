import * as React from 'react';
import { AppService, categoryName, COLORS, Criteria, Item, Request, Snapshot } from '../../types/model';
import { CATEGORY_GROUPS } from '../../utils/categories';
import { CAMPUSES } from '../../utils/locations';
import { Run } from '../../types/navigation';
import { Field, RequestInfo, stamp } from './StudentUi';
import { CriteriaDates } from './CriteriaDates';

function Colors({ value, onChange }: { value: string[]; onChange: (colors: string[]) => void }): React.ReactElement {
  return <fieldset className="lf-colors lf-criteria-colors"><legend>色 <small>複数選択・どれか1色が合えば一致</small></legend><div className="lf-category-choices">{COLORS.map(color => <label key={color} title={color}><input type="checkbox" aria-label={color} checked={value.includes(color)} onChange={event => onChange(event.target.checked ? [...value, color] : value.filter(candidate => candidate !== color))}/><span>{color}</span></label>)}</div></fieldset>;
}

export function Conditions({ value, onChange, dates = true, requireCategory = false }: { value: Criteria; onChange: (criteria: Criteria) => void; dates?: boolean; requireCategory?: boolean }): React.ReactElement {
  const group = CATEGORY_GROUPS.find(candidate => candidate.code === value.parent);
  return <div className="lf-fields lf-conditions">
    <fieldset><legend>種類</legend><div className="lf-category-choices">
      {!requireCategory && <label><input type="radio" name="criteria-parent" checked={!value.parent} onChange={() => onChange({ ...value, parent: '', category: '' })}/><span>すべて</span></label>}
      {CATEGORY_GROUPS.map(candidate => <label key={candidate.code} title={candidate.name}><input type="radio" name="criteria-parent" required={requireCategory} checked={value.parent === candidate.code} onChange={() => onChange({ ...value, parent: candidate.code, category: '' })}/><span>{candidate.name}</span></label>)}
    </div></fieldset>
    {group && <fieldset><legend>細かい種類</legend><div className="lf-category-choices">
      <label><input type="radio" name="criteria-child" checked={!value.category} onChange={() => onChange({ ...value, category: '' })}/><span>すべて</span></label>
      {group.children.map(category => <label key={category.code} title={category.name}><input type="radio" name="criteria-child" checked={value.category === category.code} onChange={() => onChange({ ...value, category: category.code })}/><span>{category.name}</span></label>)}
    </div></fieldset>}
    <Colors value={value.colors} onChange={colors => onChange({ ...value, colors })}/>
    <fieldset aria-label="キャンパス"><legend>キャンパス <small>複数選択・どれか1つが合えば一致</small></legend><div className="lf-category-choices">
      <label><input type="checkbox" checked={!value.campuses.length} onChange={() => onChange({ ...value, campuses: [], building: '' })}/><span>すべて</span></label>
      {CAMPUSES.map(campus => <label key={campus.code} title={campus.name}><input type="checkbox" checked={value.campuses.includes(campus.code)} onChange={event => onChange({ ...value, campuses: event.target.checked ? [...value.campuses, campus.code] : value.campuses.filter(code => code !== campus.code), building: '' })}/><span>{campus.name}</span></label>)}
    </div></fieldset>
    {dates && <CriteriaDates from={value.dateFrom} to={value.dateTo} onFromChange={dateFrom => onChange({ ...value, dateFrom })} onToChange={dateTo => onChange({ ...value, dateTo })}/>}
  </div>;
}

export function RequestForm({ request, criteria, service, run, after }: { request?: Request; criteria: Criteria; service: AppService; run: Run; after: () => void }): React.ReactElement {
  const [currentCriteria, setCurrentCriteria] = React.useState(request?.criteria || criteria);
  const [feature, setFeature] = React.useState(request?.feature || '');
  return <form className="lf-form" onSubmit={event => {
    event.preventDefault();
    run(() => service.saveRequest({ ...currentCriteria, query: '' }, feature, request?.id), request ? '紛失した物の内容を保存しました。' : '紛失した物を登録しました。条件に合う候補が見つかるとお知らせします。', after);
  }}>
    {!request && <p className="lf-muted">紛失した物の種類・色・場所・日付・特徴を登録します。条件に合う候補が見つかるとお知らせします。公開一覧に出ない品物は職員が確認します。</p>}
    <Conditions value={currentCriteria} onChange={setCurrentCriteria} requireCategory/>
    <p className="lf-hint">日付には、なくした時期を入力してください。通知では開始日以降に拾われた物を対象にします。</p>
    <Field label="特徴（任意）" hint="ブランド・型番、傷やシール、中身など。職員と本人だけが確認します。"><textarea rows={4} maxLength={1000} value={feature} onChange={event => setFeature(event.target.value)}/></Field>
    <button type="submit" className="lf-primary">{request ? '変更を保存' : '紛失した物を登録'}</button>
  </form>;
}

export function ClaimForm({ item, requestId, data, service, run, after }: { item: Item; requestId?: string; data: Snapshot; service: AppService; run: Run; after: () => void }): React.ReactElement {
  const [feature, setFeature] = React.useState('');
  const request = data.requests.find(candidate => candidate.id === requestId);
  return <form className="lf-form" onSubmit={event => {
    event.preventDefault();
    run(() => service.createClaim(item.id, feature, requestId), '受け取りを申し込みました。保管窓口へ取りに来てください。窓口では学校メールをお伝えください。', after);
  }}><h3>{item.title}</h3><p>受取窓口：<strong>{item.window}</strong></p>{request ? <p className="lf-info">登録済みの特徴を引き継ぎます。再入力は不要です。</p> : <Field label="特徴（任意）" hint="ブランド・型番、傷やシールなど、分かる範囲で。未入力でも申し出できます。"><textarea maxLength={1000} rows={4} value={feature} onChange={event => setFeature(event.target.value)}/></Field>}<p className="lf-muted">窓口で持ち主であることを確認してから返却します。</p><button className="lf-primary" type="submit">受け取りを申し込む</button></form>;
}

export function PrivateClaimForm({ request, itemId, window, service, run, after }: { request: Request; itemId: string; window: string; service: AppService; run: Run; after: () => void }): React.ReactElement {
  return <form className="lf-form" onSubmit={event => {
    event.preventDefault();
    run(() => service.createClaim(itemId, '', request.id), '受け取りを申し込みました。保管窓口へ取りに来てください。窓口では学校メールをお伝えください。', after);
  }}>
    <div><h3>{categoryName(request.criteria.parent, request.criteria.category)}</h3>
      <p className="lf-muted">{stamp(request.createdAt)}に登録した紛失申告への案内です。</p></div>
    <p>受取窓口：<strong>{window}</strong></p>
    <p>登録した内容に近い品物を保管しています。品物の詳細は公開していないため、窓口で自分の物か確認してください。</p>
    <details><summary>登録した内容を確認</summary><RequestInfo request={request}/></details>
    <p className="lf-muted">登録済みの特徴を引き継ぎます。窓口で持ち主であることを確認してから返却します。</p>
    <button className="lf-primary" type="submit">受け取りを申し込む</button>
  </form>;
}
