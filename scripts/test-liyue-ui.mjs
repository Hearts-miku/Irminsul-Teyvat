import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import http from 'node:http';
import {createApp} from '../server/app.mjs';
const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const app=await createApp({root,dataDir:mkdtempSync(join(out,'liyue-ui-'))}),checks=[],errors=[],requests=[];
const provider=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests.push(JSON.parse(body.messages[1].content));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({sections:[{kind:'fact',text:'归终机被毁后，凝光决定放弃群玉阁，将其投入海中以镇压魔神。',citationIds:['story-303-sacrifice']}]})}}]}));});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
 const page=await browser.newPage({viewport:{width:1360,height:960},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.goto(app.origin);
 const choose=async(query,title)=>{await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.getByLabel('搜索全部剧情目录').fill(query);await page.locator('.matching-topics .topic-button').filter({hasText:title}).click();await page.getByRole('button',{name:'按此范围开始对话'}).click();};
 await choose('望舒','浮世浮生千岩间 · 璃月第一幕');await page.getByRole('button',{name:'望舒客栈的小冥做了什么？',exact:true}).click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/不再捉弄/);checks.push('子任务搜索可定位璃月第一幕 NPC 摘要');
 await page.getByLabel('输入剧情问题').fill('钟离是谁？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('这个问题涉及本主题尚未开放的后续细节。请在剧情目录选择对应的后续章节，再开始对话。',{exact:true}).waitFor();checks.push('第一幕阻止身份剧透');
 await choose('归终','辞行久远之躯 · 璃月第二幕');await page.getByRole('button',{name:'七七说的椰羊真的存在吗？',exact:true}).click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/没有证实/);checks.push('同名任务检索与椰羊误会说明');
 await choose('迫近的客星','迫近的客星 · 璃月第三幕');
 const settings=await fetch(app.origin+'/api/settings',{method:'PUT',headers:{'X-App-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify({mode:'cloud',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,model:'liyue-test',apiKey:'test-placeholder-not-real',detail:'normal'})});assert.equal(settings.status,200);
 await page.reload();await page.getByLabel('输入剧情问题').fill('凝光为什么放弃群玉阁？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('AI 讲解',{exact:true}).waitFor();assert.ok(requests.length);assert.ok(requests[0].evidence.every(r=>r.id.startsWith('story-303-')));await page.locator('.message.assistant').last().getByRole('button',{name:'查看出处 1',exact:true}).click();assert.match(await page.locator('.evidence-drawer').innerText(),/666994/);assert.match(await page.locator('.evidence-drawer').innerText(),/对白片段核对/);await page.screenshot({path:join(out,'13-liyue-source.png'),fullPage:true});await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('在线协议仅使用第三幕证据并显示回天固定出处');
 app.store.saveSettings({...app.store.settings(),mode:'offline'});
 await page.reload();await page.getByLabel('输入剧情问题').fill('钟离与冰之女皇交换了什么？');await page.getByRole('button',{name:'发送问题'}).click();await page.waitForFunction(()=>document.querySelectorAll('.message.assistant').length===2);await page.getByRole('button',{name:'发送问题'}).waitFor({state:'visible'});assert.match(await page.locator('.message.assistant').last().innerText(),/没有公开/);await page.getByRole('button',{name:'旅程档案',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.record-card').length===12);checks.push('交易未知项与第三幕档案、刷新恢复');
 assert.deepEqual(errors,[]);checks.push('无新增前端运行时错误');writeFileSync(join(out,'liyue-ui-report.json'),JSON.stringify({passed:true,checks,errors,provider:'local mock'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(e){writeFileSync(join(out,'liyue-ui-report.json'),JSON.stringify({passed:false,checks,errors,error:e.message},null,2));throw e;}
finally{await browser?.close();await app.close();provider.closeAllConnections();await new Promise(r=>provider.close(r));}
