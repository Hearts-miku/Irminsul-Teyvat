import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {chromium} from 'playwright';
import {validatePlan,requestJson,extractSections,digest,apiAllowed,apiUrl} from './lib/story-sources.mjs';
const args=process.argv.slice(2),name=args.find(x=>!x.startsWith('--'))??'journey-bridge';
if(!/^[a-z0-9-]+$/.test(name))throw Error('只接受 collection-plans 内的清单 ID');
const root=resolve('.'),plan=validatePlan(JSON.parse(readFileSync(join(root,'data/collection-plans',name+'.json'),'utf8')));
const dir=join(root,'.cache/story-sources',plan.id);mkdirSync(dir,{recursive:true});
const report={plan:plan.id,startedAt:new Date().toISOString(),offline:args.includes('--offline'),pages:[],published:false};
const atomic=(path,value)=>{writeFileSync(path+'.tmp',JSON.stringify(value,null,2)+'\n');renameSync(path+'.tmp',path);};
let revisions=new Map(),browser,robotsText='';
const request=params=>{if(!apiAllowed(robotsText,apiUrl(params)))throw Error('robots.txt 不允许此请求');return requestJson(params);};
try{
 if(!report.offline){
  const robots=await fetch('https://wiki.biligame.com/robots.txt',{signal:AbortSignal.timeout(20000),redirect:'error'});if(!robots.ok)throw Error('无法核对 robots.txt');const text=await robots.text();if(!apiAllowed(text))throw Error('robots.txt 不允许此采集路径');writeFileSync(join(dir,'robots.txt'),text);
  robotsText=text;
  const metadata=await request({action:'query',prop:'revisions',rvprop:'ids',titles:plan.pages.map(p=>p.title).join('|'),redirects:'1'});
  const resolved=new Map((metadata.query?.pages??[]).map(p=>[p.title,p]));const aliases=[...(metadata.query?.normalized??[]),...(metadata.query?.redirects??[])];
  for(const p of plan.pages){let title=p.title;for(let i=0;i<aliases.length+1;i++){const alias=aliases.find(a=>a.from===title);if(!alias)break;title=alias.to;}revisions.set(p.key,resolved.get(title)?.revisions?.[0]?.revid);}
 }
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});const context=await browser.newContext({javaScriptEnabled:false});await context.route('**/*',r=>r.abort());const page=await context.newPage();
 for(const item of plan.pages){
  const path=join(dir,item.key+'.json'),old=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
  try{
   if(report.offline){if(!old||digest(old.html)!==old.snapshotSha256)throw Error('离线缓存缺失或校验失败');report.pages.push({key:item.key,title:old.title,revision:old.revision,status:'cached-offline',snapshotSha256:old.snapshotSha256});continue;}
   const revision=revisions.get(item.key);if(!revision)throw Error('页面不存在或修订信息缺失');
   if(old&&old.revision===revision&&digest(old.html)===old.snapshotSha256&&!args.includes('--refresh')){report.pages.push({key:item.key,title:old.title,revision,status:'cached',snapshotSha256:old.snapshotSha256});continue;}
   await new Promise(r=>setTimeout(r,1000));const response=await request({action:'parse',page:item.title,prop:'text|sections|links|revid',redirects:'1'}),p=response.parse;
   if(!p?.text||!Number.isSafeInteger(p.revid))throw Error('缺少正文或修订号');const html=typeof p.text==='string'?p.text:p.text['*'];const sections=await extractSections(page,html);if(!sections.length)throw Error('正文没有可识别章节');
   const value={key:item.key,requestedTitle:item.title,title:p.title,revision:p.revid,capturedAt:new Date().toISOString(),url:'https://wiki.biligame.com/ys/'+encodeURIComponent(p.title),license:'BWIKI 页面标注 CC BY-NC-SA 4.0；游戏内容权利归原权利人',snapshotSha256:digest(html),html,sections,linkedPages:(p.links??[]).filter(l=>l.ns===0&&l.exists).map(l=>l.title??l['*']),status:'unreviewed'};
   atomic(join(dir,`${item.key}-${p.revid}-${value.snapshotSha256.slice(0,12)}.json`),value);atomic(path,value);
   report.pages.push({key:item.key,title:p.title,revision:p.revid,status:old?'updated':'fetched',sections:sections.length,snapshotSha256:value.snapshotSha256,previousSha256:old?.snapshotSha256});
  }catch(error){report.pages.push({key:item.key,title:item.title,status:'failed',error:error.message,retainedPrevious:!!old});}
 }
}catch(error){report.error=error.message;process.exitCode=1;}
finally{await browser?.close();report.finishedAt=new Date().toISOString();report.failed=report.pages.filter(p=>p.status==='failed').length;if(report.failed)process.exitCode=1;atomic(join(dir,'report.json'),report);console.log(JSON.stringify(report,null,2));}
