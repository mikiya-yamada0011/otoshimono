import * as React from 'react';
import { COLORS } from '../../types/model';
import { CATEGORY_GROUPS } from '../../utils/categories';
import { CAMPUSES, getCampus, getBuilding } from '../../utils/locations';

export function RegistrationCategories({value,onChange}:{value:{parent:string;category:string};onChange:(value:{parent:string;category:string})=>void}):React.ReactElement {
  const group=CATEGORY_GROUPS.find(candidate=>candidate.code===value.parent);
  return <div className="lf-registration-categories">
    <fieldset><legend>親カテゴリ（必須）</legend><div className="lf-category-choices">{CATEGORY_GROUPS.map(category=><label key={category.code} title={category.name}><input type="radio" name="registration-parent" required checked={value.parent===category.code} onChange={()=>onChange({parent:category.code,category:''})}/><span>{category.name}</span></label>)}</div></fieldset>
    <fieldset><legend>細かい種類（必須）</legend>{group?<div className="lf-category-choices">{group.children.map(category=><label key={category.code} title={category.name}><input type="radio" name="registration-child" required checked={value.category===category.code} onChange={()=>onChange({...value,category:category.code})}/><span>{category.name}</span></label>)}</div>:<p className="lf-muted">先に親カテゴリを選択してください。</p>}</fieldset>
  </div>;
}

export function RegistrationColors({value,onChange}:{value:string[];onChange:(colors:string[])=>void}):React.ReactElement {
  return <fieldset className="lf-registration-colors"><legend>色（複数選択・任意）</legend><div className="lf-category-choices">{COLORS.map(color=><label key={color} title={color}><input type="checkbox" aria-label={color} checked={value.includes(color)} onChange={event=>onChange(event.target.checked?[...value,color]:value.filter(candidate=>candidate!==color))}/><span>{color}</span></label>)}</div></fieldset>;
}

export function RegistrationLocations({value,onChange}:{value:{campus:string;building:string};onChange:(value:{campus:string;building:string})=>void}):React.ReactElement {
  const [query,setQuery]=React.useState('');
  const [open,setOpen]=React.useState(!value.campus);
  const searchRef=React.useRef<HTMLInputElement>(null);
  const selectedRef=React.useRef<HTMLButtonElement>(null);
  React.useEffect(()=>{if(open&&value.campus)searchRef.current?.focus();},[open,value.campus]);
  const campus=getCampus(value.campus);
  const buildings=campus?.buildings.filter(building=>building.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) || [];
  const selectedName=`選択中：${getBuilding(value.building)?.name || '指定なし'}`;
  const closeSearch=():void=>{setQuery('');setOpen(false);requestAnimationFrame(()=>selectedRef.current?.focus());};
  const selectBuilding=(building:string):void=>{closeSearch();onChange({...value,building});};
  return <div className="lf-registration-locations">
    <fieldset><legend>拾得キャンパス（必須）</legend><div className="lf-category-choices">{CAMPUSES.map(candidate=><label key={candidate.code} title={candidate.name}><input type="radio" name="registration-campus" required checked={value.campus===candidate.code} onChange={()=>{setQuery('');setOpen(true);onChange({campus:candidate.code,building:''});}}/><span>{candidate.name}</span></label>)}</div></fieldset>
    <fieldset><legend>建物・エリア（任意）</legend>
      {campus&&!open&&<button ref={selectedRef} type="button" className="lf-building-selected" aria-label={`${selectedName}：変更する`} aria-expanded={false} onClick={()=>{setQuery('');setOpen(true);}}>{selectedName}</button>}
      {campus&&open&&<input ref={searchRef} className="lf-building-selected lf-building-search" type="search" aria-label="建物名で絞り込み" title={selectedName} maxLength={100} value={query} onChange={event=>setQuery(event.target.value)} placeholder={`${selectedName}（建物名で絞り込み）`} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch();}}}/>}
      {campus&&open&&<div className="lf-building-choices"><label><input type="radio" name="registration-building" checked={!value.building} onClick={()=>{if(!value.building)selectBuilding('');}} onChange={()=>selectBuilding('')}/><span>指定なし</span></label>{buildings.map(building=><label key={building.code} title={building.name}><input type="radio" name="registration-building" checked={value.building===building.code} onClick={()=>{if(value.building===building.code)selectBuilding(building.code);}} onChange={()=>selectBuilding(building.code)}/><span>{building.name}</span></label>)}</div>}
      {campus&&open&&!buildings.length&&<p className="lf-muted lf-building-empty" role="status">該当する建物はありません。</p>}
      {!campus&&<p className="lf-muted">先にキャンパスを選択してください。</p>}
    </fieldset>
  </div>;
}
