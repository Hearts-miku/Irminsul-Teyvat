// Opt-in integration check. Read the user's saved configuration and encrypted
// key in Electron; write test sessions only to a temporary application store.
import {app,safeStorage} from 'electron';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server/app.mjs';
const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});const dir=mkdtempSync(join(out,'real-model-data-'));app.setPath('userData',dir);const chromium=join(dir,'chromium');mkdirSync(chromium,{recursive:true});app.setPath('sessionData',chromium);const savedState=JSON.parse(readFileSync(join(root,'release/win-unpacked/user-data/chromium/Local State'),'utf8'));writeFileSync(join(chromium,'Local State'),JSON.stringify({os_crypt:savedState.os_crypt}));
process.on('exit',()=>{try{unlinkSync(join(chromium,'Local State'));}catch{}});
const report={checkedAt:new Date().toISOString(),realProvider:true,productionDataReadOnly:true,checks:[],passed:false};let service;
app.whenReady().then(async()=>{
 report.phase='read-settings';const production=join(root,'release/win-unpacked/user-data'),db=new DatabaseSync(join(production,'stories.sqlite'),{readOnly:true});let settings;try{settings=JSON.parse(db.prepare('SELECT value FROM preferences WHERE id=1').get()?.value??'{}');}finally{db.close();}
 report.phase='decrypt-key';const key=safeStorage.decryptString(readFileSync(join(production,'model-key.enc')));if(!settings.baseUrl||!settings.model||!key)throw Error('现有在线模型配置不完整');
 report.phase='start-service';service=await createApp({root,dataDir:dir,secrets:{persistent:false,read:()=>key,write:()=>{throw Error('read only');},clear:()=>{throw Error('read only');}}});service.store.saveSettings({...settings,mode:'cloud'});
 const headers={'X-App-Token':service.token,'Content-Type':'application/json'};
 const req=async(path,body)=>{const r=await fetch(service.origin+path,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});if(!r.ok){const body=await r.json();const safe=/^(模型服务|模型响应超时|无法连接模型服务|请先保存完整)/.test(body.error??'')?body.error:'HTTP '+r.status;throw Error('真实服务验证：'+safe);}return r;};
 report.phase='connection';await req('/api/connection',{});report.checks.push({name:'真实服务连通',passed:true});
 const session=(await (await req('/api/sessions',{progress:102})).json()).session;
 report.phase='chat-and-followup';for(const question of ['阿芬迪为什么招募旅行者？','再详细讲讲']){
  await (await req('/api/chat',{sessionId:session.id,question})).text();const answer=service.store.messages(session.id).at(-1);if(answer?.mode!=='cloud')throw Error('真实讲解回退：'+(answer?.warning??'未返回在线回答'));if(!answer.citations?.length||!answer.sections?.some(s=>s.citationIds?.length))throw Error('真实回答缺少引用');if(answer.citations.some(c=>c.stage!==102))throw Error('真实回答跨范围引用');report.checks.push({name:question,passed:true,mode:answer.mode,citations:answer.citations.map(c=>c.id)});
 }
 service.store.setProgress(session.id,1000021148);if(service.store.messages(session.id).length)throw Error('切换未清理历史');
 await (await req('/api/chat',{sessionId:session.id,question:'关于龙灾，提米怎么说？'})).text();const answer=service.store.messages(session.id).at(-1);if(answer?.mode!=='cloud')throw Error('原文在线讲解回退：'+(answer?.warning??'未返回在线回答'));if(!answer.citations?.length||answer.citations.some(c=>c.stage!==1000021148))throw Error('原文引用越界或为空');report.checks.push({name:'切换到提米原文后问答与引用',passed:true,mode:answer.mode,citations:answer.citations.map(c=>c.id)});report.passed=true;
}).catch(error=>{report.error=error.message.startsWith('真实')||error.message.startsWith('原文')||error.message.startsWith('现有')?error.message:'验证未通过；未记录上游响应或凭据';}).finally(async()=>{await service?.close();writeFileSync(join(out,'real-model-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));app.exit(report.passed?0:1);});
