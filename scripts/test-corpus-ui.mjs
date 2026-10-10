import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import http from 'node:http';
import {createApp} from '../server/app.mjs';
const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const app=await createApp({root,dataDir:mkdtempSync(join(out,'corpus-ui-'))}),checks=[],errors=[],requests=[];
const provider=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw),input=JSON.parse(body.messages[1].content);requests.push(input);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({sections:[{kind:'fact',text:'这些片段记录了人物对枫丹审判与歌剧的看法，应区分人物观点和已证实事实。',citationIds:[input.evidence[0].id]}]})}}]}));});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
 const page=await browser.newPage({viewport:{width:1360,height:960},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.goto(app.origin);
 await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.getByLabel('搜索全部剧情目录').fill('提米');await page.locator('.catalog-list .catalog-row').filter({has:page.getByText('提米',{exact:true})}).first().click();await page.getByRole('heading',{name:'关联原文',exact:true}).waitFor();await page.locator('.catalog-detail .topic-button').filter({hasText:'选择原文范围'}).click();await page.getByRole('button',{name:'按此范围开始对话'}).click();checks.push('旧目录可按准确名称进入关联原文并确认剧情范围');
 await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.getByRole('button',{name:'原文资料库',exact:true}).click();await page.getByLabel('搜索原文资料').fill('白露与黑潮的序诗');await page.locator('.corpus-library .catalog-row').filter({hasText:'独舞者的序幕'}).waitFor();checks.push('原文资料库可按系列查找具体子任务');
 await page.getByLabel('搜索原文资料').fill('感人故事');await page.getByLabel('同时搜索正文').check();await page.locator('.corpus-library .catalog-row').filter({hasText:'独舞者的序幕'}).waitFor();checks.push('全文关键词可命中已采集的对白');
 await page.getByLabel('同时搜索正文').uncheck();await page.getByLabel('搜索原文资料').fill('独舞者的序幕');await page.locator('.corpus-library .catalog-row').filter({hasText:'独舞者的序幕'}).click();await page.getByRole('button',{name:'按此范围开始对话'}).click();
 const ask=async q=>{await page.getByLabel('输入剧情问题').fill(q);await page.getByRole('button',{name:'发送问题'}).click();await page.getByRole('button',{name:'停止讲解'}).waitFor({state:'hidden'});await page.locator('.message.assistant').last().locator('.source-chips').waitFor();};
 await ask('为什么把审判当作歌剧？');assert.match(await page.locator('.message.assistant').last().innerText(),/尚未逐条核对/);await page.locator('.message.assistant').last().getByRole('button',{name:'查看出处 1',exact:true}).click();assert.match(await page.locator('.evidence-drawer').innerText(),/自动采集，未逐条核对/);assert.match(await page.locator('.evidence-drawer').innerText(),/源码片段/);await page.screenshot({path:join(out,'15-corpus-source.png'),fullPage:true});await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('离线问答与出处抽屉明确标注原文、修订和核对状态');
 await ask('再详细讲讲');await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.message.assistant').length===2);checks.push('原文范围的连续追问与刷新恢复');
 const settings=await fetch(app.origin+'/api/settings',{method:'PUT',headers:{'X-App-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify({mode:'cloud',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,model:'corpus-test',apiKey:'test-placeholder-not-real',detail:'normal'})});assert.equal(settings.status,200);
 await ask('枫丹居民怎样看待歌剧和审判？');await page.getByText('AI 讲解',{exact:true}).waitFor();assert.ok(requests.length);assert.ok(requests.at(-1).evidence.every(r=>r.id.startsWith('corpus-')&&r.contentType==='source'));assert.equal(new Set(requests.at(-1).evidence.map(r=>r.id.split('-')[1])).size,1);checks.push('模拟在线模型仅收到所选页面的证据，返回引用通过校验');
 await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.getByRole('button',{name:'原文资料库',exact:true}).click();await page.locator('.corpus-library .catalog-row').first().waitFor();await page.setViewportSize({width:700,height:900});await page.screenshot({path:join(out,'16-corpus-library.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push('原文资料库在窄屏内可浏览');
 assert.deepEqual(errors,[]);checks.push('无新增前端运行时错误');writeFileSync(join(out,'corpus-ui-report.json'),JSON.stringify({passed:true,checks,errors,provider:'local mock'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(e){writeFileSync(join(out,'corpus-ui-report.json'),JSON.stringify({passed:false,checks,errors,error:e.message},null,2));throw e;}
finally{await browser?.close();await app.close();provider.closeAllConnections();await new Promise(r=>provider.close(r));}
