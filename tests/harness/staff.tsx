import * as React from 'react';
import * as ReactDom from 'react-dom';
import StaffHarnessApp from '../support/StaffHarnessApp';
import { DemoRepository, DEMO_STAFF } from '../support/DemoRepository';
import { WorkflowService } from '../support/WorkflowService';
const service=new WorkflowService(new DemoRepository({...DEMO_STAFF}));
ReactDom.render(<><div className="lf-test-toolbar"><strong>自動テスト用ハーネス</strong><span>職員画面</span><a href="?role=student">学生側を開く</a><span>Power Appsとは別の保存先・外部送信なし</span></div><StaffHarnessApp service={service}/></>,document.getElementById('root'));
