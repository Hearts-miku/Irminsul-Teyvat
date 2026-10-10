import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import http from 'node:http';
import {createApp} from '../server/app.mjs';
const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const app=await createApp({root,dataDir:mkdtempSync(join(out,'bridge-ui-'))}),checks=[],errors=[],requests=[];
const provider=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests.push(JSON.parse(body.messages[1].content));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({sections:[{kind:'fact',text:'戎世更看重训练与切磋，认为败北能帮助自己认识差距。',citationIds:['story-401-rongshi']}]})}}]}));});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
 const page=await browser.newPage({viewport:{width:1360,height:960},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.goto(app.origin);
 const choose=async(query,title)=>{await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.getByLabel('搜索全部剧情目录').fill(query);await page.locator('.matching-topics .topic-button').filter({hasText:title}).click();await page.getByRole('button',{name:'按此范围开始对话'}).click();await page.getByLabel('输入剧情问题').waitFor();};
 await choose('拾枝者·戴因斯雷布','拾枝者·戴因斯雷布 · 旅人线前置');await page.getByRole('button',{name:'戴因的三个问题有正确答案吗？',exact:true}).click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/不同选项/);checks.push('戴因前置态度问题保留选项差异');
 await page.getByLabel('输入剧情问题').fill('戴因与坎瑞亚是什么关系？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('这个问题涉及本主题尚未开放的后续细节。请在剧情目录选择对应的后续章节，再开始对话。',{exact:true}).waitFor();checks.push('前置任务阻止后续身份剧透');
 await choose('有隔阂的魂灵','我们终将重逢 · 旅人线第一章');await page.getByRole('button',{name:'重逢后为什么没有一起回家？',exact:true}).click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/暂时不能/);checks.push('重逢章节解释血亲选择并保留未知经历');
 await choose('南十字武斗会','振袖秋风问红叶 · 稻妻序幕');
 const settings=await fetch(app.origin+'/api/settings',{method:'PUT',headers:{'X-App-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify({mode:'cloud',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,model:'bridge-test',apiKey:'test-placeholder-not-real',detail:'normal'})});assert.equal(settings.status,200);
 await page.reload();await page.getByLabel('输入剧情问题').fill('戎世为什么不羡慕神之眼？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('AI 讲解',{exact:true}).waitFor();assert.ok(requests.length);assert.ok(requests[0].evidence.every(r=>r.id.startsWith('story-401-')));await page.locator('.message.assistant').last().getByRole('button',{name:'查看出处 1',exact:true}).click();assert.match(await page.locator('.evidence-drawer').innerText(),/665390/);assert.match(await page.locator('.evidence-drawer').innerText(),/对白片段核对/);await page.screenshot({path:join(out,'14-bridge-source.png'),fullPage:true});await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('在线协议使用稻妻序幕证据并定位武斗会出处');
 app.store.saveSettings({...app.store.settings(),mode:'offline'});
 await page.reload();await page.getByLabel('输入剧情问题').fill('北斗是否第一次见旅行者？');await page.getByRole('button',{name:'发送问题'}).click();await page.waitForFunction(()=>document.querySelectorAll('.message.assistant').length===2);await page.getByRole('button',{name:'发送问题'}).waitFor({state:'visible'});assert.match(await page.locator('.message.assistant').last().innerText(),/两种条件不能拼成/);await page.getByRole('button',{name:'旅程档案',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.record-card').length===12);checks.push('条件分支、12 条档案与刷新恢复');
 assert.deepEqual(errors,[]);checks.push('无新增前端运行时错误');writeFileSync(join(out,'bridge-ui-report.json'),JSON.stringify({passed:true,checks,errors,provider:'local mock'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(e){writeFileSync(join(out,'bridge-ui-report.json'),JSON.stringify({passed:false,checks,errors,error:e.message},null,2));throw e;}
finally{await browser?.close();await app.close();provider.closeAllConnections();await new Promise(r=>provider.close(r));}
