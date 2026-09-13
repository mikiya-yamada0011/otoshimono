import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import { type IPropertyPaneConfiguration, PropertyPaneTextField } from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import LostFoundApp from './app/LostFoundApp';
import { SharePointRepository } from './app/repositories';
import { StudentService } from './app/service';

export interface ILostFoundStudentWebPartProps {
  schoolEmailDomains: string;
  dataSiteUrl: string;
}
export default class LostFoundStudentWebPart extends BaseClientSideWebPart<ILostFoundStudentWebPartProps> {
  private service?: StudentService;
  private loadError='';
  protected async onInit(): Promise<void> {
    await super.onInit();
    await this.connect();
  }
  private async connect(): Promise<void> {
    const user=this.context.pageContext.user;
    if(user.isAnonymousGuestUser || !this.context.pageContext.legacyPageContext.userId) {
      this.loadError='SharePointへのサインインを確認できません。ページを再読込してください。';return;
    }
    const email=user.email || user.loginName.split('|').pop() || '';
    const dataSiteUrl=(this.properties.dataSiteUrl || this.context.pageContext.web.absoluteUrl).replace(/\/$/,'');
    const repo=new SharePointRepository(this.context.spHttpClient,dataSiteUrl,{id:String(this.context.pageContext.legacyPageContext.userId),name:user.displayName,email,role:'student'});
    const configuredDomains=(this.properties.schoolEmailDomains || 'stu.kobe-u.ac.jp').split(',').map(d=>d.trim().toLowerCase()).filter(Boolean);
    const emailDomain=email.toLowerCase().split('@')[1];
    const domains=this.context.isServedFromLocalhost && emailDomain
      ? [...new Set([...configuredDomains,emailDomain])]
      : configuredDomains;
    this.service=undefined;this.loadError='';
    this.service=new StudentService(repo,domains,`${window.location.origin}${window.location.pathname}`);
  }
  public render(): void {
    const element: React.ReactElement = this.service ? React.createElement(LostFoundApp,{service:this.service}) : React.createElement('p',{role:'alert'},this.loadError || '接続を準備しています…');
    ReactDom.render(element,this.domElement);
  }
  protected onDispose(): void { ReactDom.unmountComponentAtNode(this.domElement); }
  protected get dataVersion(): Version { return Version.parse('2.0'); }
  protected async onPropertyPaneFieldChanged(propertyPath:string,oldValue:unknown,newValue:unknown):Promise<void> {
    super.onPropertyPaneFieldChanged(propertyPath,oldValue,newValue);
    await this.connect();this.render();
  }
  protected getPropertyPaneConfiguration():IPropertyPaneConfiguration {
    return {pages:[{header:{description:'学生専用の検索・紛失届・返却申出。職員操作はPower Appsで行います。'},groups:[{groupName:'接続設定',groupFields:[PropertyPaneTextField('dataSiteUrl',{label:'データを保存するSharePointサイトURL（空欄なら現在のサイト）'}),PropertyPaneTextField('schoolEmailDomains',{label:'学校メールの許可ドメイン（カンマ区切り）'})]}]}]};
  }
}
