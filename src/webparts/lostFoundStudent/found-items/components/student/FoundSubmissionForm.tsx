import * as React from 'react';
import { AppService, FoundSubmissionInput, today } from '../../types/model';
import { RegistrationCategories, RegistrationColors, RegistrationLocations } from '../registration/RegistrationChoices';
import { Run } from '../../types/navigation';
import { Field } from './StudentUi';

export function FoundSubmissionForm({service,run,after}:{service:AppService;run:Run;after:()=>void}):React.ReactElement {
  const [input,setInput]=React.useState<FoundSubmissionInput>({parent:'',category:'',colors:[],campus:'',building:'',place:'',foundOn:today(),feature:'',receiveReturnEmail:true});
  return <form className="lf-form lf-found-form" onSubmit={event=>{event.preventDefault();run(()=>service.submitFoundItem(input),'登録しました。窓口で職員に届け出の確認を依頼してください。',after);}}>
    <RegistrationCategories value={input} onChange={selection=>setInput({...input,...selection})}/>
    <RegistrationColors value={input.colors} onChange={colors=>setInput({...input,colors})}/>
    <RegistrationLocations value={input} onChange={selection=>setInput({...input,...selection})}/>
    <Field label="詳細場所（任意）"><input maxLength={200} value={input.place} onChange={event=>setInput({...input,place:event.target.value})} placeholder="1階廊下、自動販売機付近 など"/></Field>
    <div className="lf-date-input"><Field label="拾った日"><input required type="date" max={today()} value={input.foundOn} onChange={event=>setInput({...input,foundOn:event.target.value})}/></Field></div>
    <Field label="特徴（任意）" hint="名前や学生番号などの個人情報は書かないでください。"><textarea rows={3} maxLength={1000} value={input.feature} onChange={event=>setInput({...input,feature:event.target.value})}/></Field>
    <label className="lf-check"><input type="checkbox" checked={input.receiveReturnEmail} onChange={event=>setInput({...input,receiveReturnEmail:event.target.checked})}/>持ち主に返却されたら、お礼メールを受け取る</label>
    <p className="lf-muted">登録後は窓口で職員に確認を依頼してください。内容の訂正も窓口にお伝えください。</p>
    <button className="lf-primary" type="submit">登録</button>
  </form>;
}
