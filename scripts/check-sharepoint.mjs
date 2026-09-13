import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const bundle=await build({stdin:{contents:"export {SharePointRepository} from './src/webparts/lostFoundStudent/app/repositories';export {StudentService} from './src/webparts/lostFoundStudent/app/service';",resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'iife',globalName:'LFCheck',write:false,plugins:[{name:'sp-runtime',setup(b){b.onResolve({filter:/^@microsoft\/sp-http$/},()=>({path:'sp-http',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const SPHttpClient={configurations:{v1:{}}};'}));}}]});
const browser=await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:9222');
try {
 const page=browser.contexts()[0].pages().find(p=>p.url()==='https://cloudkobeu.sharepoint.com/teams/t-dxsuisin-tesvd2');
 if(!page)throw new Error('SharePointのホームで手動ログインしてください。');
 await page.evaluate(bundle.outputFiles[0].text+'; window.LFCheck = LFCheck;');
 console.log(await page.evaluate(async(storage)=>{
   const site=location.origin+'/teams/t-dxsuisin-tesvd2';
   const me=await (await fetch(site+'/_api/web/currentuser',{headers:{Accept:'application/json;odata=nometadata'}})).json();
   let digest='';
   const repo=new LFCheck.SharePointRepository({get:(url,_,options)=>fetch(url,options),post:async(url,_,options)=>{if(!storage||!url.includes("getbytitle('LFProfiles')"))throw new Error('本人情報の一時検証データ以外は書き込み禁止');if(!digest)digest=(await (await fetch(site+'/_api/contextinfo',{method:'POST',headers:{Accept:'application/json;odata=nometadata'}})).json()).FormDigestValue;return fetch(url,{...options,method:'POST',headers:{...options.headers,'X-RequestDigest':digest}});}},site,{id:String(me.Id),name:me.Title,email:me.Email,role:'student'});
   const s=new LFCheck.StudentService(repo);const data=await s.load();
   if(data.items.some(i=>!i.etag))throw new Error('更新競合チェックに必要なETagがありません。');
   let storageVerified=false;
   if(storage){
     let id;try{
       id=await repo.put('profiles',{name:'接続検証・終了後削除',email:me.Email,window:'農学部事務室'});
       const row=(await repo.list('profiles')).find(r=>r.id===id);
       if(!row?.etag || row.value.window!=='農学部事務室')throw new Error('保存値またはETagが取得できません。');
       await repo.put('profiles',{...row.value,window:'検証用窓口'},id,row.etag);
       let rejected=false;try{await repo.put('profiles',row.value,id,row.etag);}catch(e){rejected=e.message.includes('他の職員が更新');}
       if(!rejected)throw new Error('古いETagの更新が拒否されませんでした。');
       storageVerified=true;
     }finally{if(id)await repo.remove('profiles',id);}
   }
   return {storageVerified,role:data.user.role,items:data.items.length,stored:data.items.filter(i=>i.status==='保管中').length,privateItems:data.items.filter(i=>i.valuable).length,requests:data.requests.length,claims:data.claims.length,notices:data.notices.length,mail:data.mail.length,temporaryProfileRemoved:storage};
 },process.argv.includes('--storage')));
}finally{await browser.close();}
