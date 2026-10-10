import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import http from 'node:http';
import {createApp} from '../server/app.mjs';
const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const app=await createApp({root,dataDir:mkdtempSync(join(out,'mondstadt-ui-'))}),checks=[],errors=[],requests=[];
const provider=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests.push(JSON.parse(body.messages[1].content));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({sections:[{kind:'fact',text:'深渊法师在摘星崖打断交流并煽动特瓦林，使救助行动受挫。',citationIds:['story-202-sabotage']}]})}}]}));});
await new Promise(r=>provider.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
 const page=await browser.newPage({viewport:{width:1360,height:960},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.goto(app.origin);
 const choose=async(query,title)=>{await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.getByLabel('搜索全部剧情目录').fill(query);await page.locator('.matching-topics .topic-button').filter({hasText:title}).click();await page.getByRole('button',{name:'按此范围开始对话'}).click();};
 await choose('骑士的现场教习','捕风的异乡人 · 蒙德第一幕');await page.getByRole('button',{name:'为什么要调查三座庙宇？',exact:true}).click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/并行|庙宇/);checks.push('按子任务名定位整幕摘要并开始问答');
 await page.getByLabel('输入剧情问题').fill('温迪的身份是什么？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('这个问题涉及本主题尚未开放的后续细节。请在剧情目录选择对应的后续章节，再开始对话。',{exact:true}).waitFor();checks.push('第一幕不提前回答后幕身份');
 await choose('为了没有眼泪的明天','为了没有眼泪的明天 · 蒙德第二幕');await page.getByRole('button',{name:'概括为了没有眼泪的明天这一幕',exact:true}).click();await page.locator('.source-chips').waitFor();assert.equal(await page.locator('.answer-section.fact').count(),1);assert.match(await page.locator('.answer-body').innerText(),/摘星崖/);checks.push('整幕概括覆盖行动收束');
 const settings=await fetch(app.origin+'/api/settings',{method:'PUT',headers:{'X-App-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify({mode:'cloud',baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,model:'mondstadt-test',apiKey:'test-placeholder-not-real',detail:'normal'})});assert.equal(settings.status,200);
 await page.reload();await page.getByLabel('输入剧情问题').fill('摘星崖的行动为什么失败了？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('AI 讲解',{exact:true}).waitFor();assert.ok(requests.length);assert.ok(requests[0].evidence.every(r=>r.id.startsWith('story-202-')));await page.locator('.message.assistant').last().getByRole('button',{name:'查看出处 1',exact:true}).click();assert.match(await page.locator('.evidence-drawer').innerText(),/667033/);assert.match(await page.locator('.evidence-drawer').innerText(),/对白片段核对/);await page.screenshot({path:join(out,'12-mondstadt-source.png'),fullPage:true});await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('在线协议使用第二幕证据并显示子任务固定出处');
 app.store.saveSettings({...app.store.settings(),mode:'offline'});
 await choose('巨龙与自由之歌','巨龙与自由之歌 · 蒙德第三幕');await page.getByRole('button',{name:'龙灾结束后蒙德市民怎么说？',exact:true}).click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/塞琉斯/);await page.getByRole('button',{name:'旅程档案',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.record-card').length===13);checks.push('第三幕市民问答与整幕档案');
 assert.deepEqual(errors,[]);checks.push('无新增前端运行时错误');writeFileSync(join(out,'mondstadt-ui-report.json'),JSON.stringify({passed:true,checks,errors,provider:'local mock'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(e){writeFileSync(join(out,'mondstadt-ui-report.json'),JSON.stringify({passed:false,checks,errors,error:e.message},null,2));throw e;}
finally{await browser?.close();await app.close();provider.closeAllConnections();await new Promise(r=>provider.close(r));}
