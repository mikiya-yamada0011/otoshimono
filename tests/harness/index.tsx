import * as React from 'react';
import * as ReactDom from 'react-dom';
import LostFoundApp from '../../src/webparts/lostFoundStudent/app/LostFoundApp';
import { StudentService } from '../../src/webparts/lostFoundStudent/found-items/api/service';
import { DemoRepository, DEMO_STUDENT } from '../support/DemoRepository';
import './harness.scss';
if(new URLSearchParams(location.search).get('role')==='staff') {
  import('./staff').catch(e=>{document.getElementById('root')!.textContent=String(e);});
} else {
const repository=new DemoRepository({...DEMO_STUDENT});
if(new URLSearchParams(location.search).get('submissions')==='unavailable') {
  const list=repository.list.bind(repository);
  repository.list=async table=>{
    if(table==='submissions' && sessionStorage.getItem('test-submissions-recovered')!=='true') throw new Error('LFFoundSubmissions: 必要なデータにアクセスできません。');
    return list(table);
  };
}
const service=new StudentService(repository);
ReactDom.render(<><div className="lf-test-toolbar"><strong>自動テスト用ハーネス</strong><span>学生画面</span><a href="?role=staff">職員側を開く</a><span>ブラウザ内保存・外部送信なし</span></div><LostFoundApp service={service}/></>,document.getElementById('root'));

}
