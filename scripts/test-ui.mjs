import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createApp } from '../server/app.mjs';

const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const dataDir=mkdtempSync(join(out,'ui-data-'));
const service=await createApp({root,dataDir});
const checks=[],errors=[];let providerFails=false,requests=0;
const mock=http.createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests++;if(providerFails){res.writeHead(401);res.end('blocked');return;}res.setHeader('Content-Type','application/json');const test=body.messages[0]?.content?.startsWith('连接测试');res.end(JSON.stringify({choices:[{message:{content:test?'连接成功。':JSON.stringify({sections:[{kind:'fact',text:'她正在执行巡查职责，需要先了解陌生旅人的来历。',citationIds:['a-identity']}]})}}]}));});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath});
  const page=await browser.newPage({viewport:{width:1360,height:960},deviceScaleFactor:1,reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(service.origin);await page.getByRole('heading',{name:'与风同行',exact:true}).waitFor();
  await page.screenshot({path:join(out,'01-welcome.png'),fullPage:true});checks.push('首页与原创插画正常显示');
  await page.getByRole('button',{name:'安柏为什么怀疑旅行者？',exact:true}).click();
  await page.getByRole('button',{name:'查看出处 1',exact:true}).first().waitFor();
  await page.getByRole('button',{name:'查看出处 1',exact:true}).first().click();await page.getByRole('heading',{name:'故事有迹可循'}).waitFor();
  assert.match(await page.locator('.evidence-drawer').innerText(),/674009/);await page.screenshot({path:join(out,'02-evidence.png'),fullPage:true});await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('提问、回答、原文短摘与固定版本出处');
  await page.getByLabel('输入剧情问题').fill('那她为什么还要护送我们？');await page.getByRole('button',{name:'发送问题'}).click();await page.locator('.message.assistant').nth(1).locator('.source-chips').waitFor();checks.push('连续追问沿用话题');
  await page.getByLabel('输入剧情问题').fill('她为什么送风之翼？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('这个问题涉及当前进度之外的内容。你可以先继续当前任务，或在「剧情进度」中主动开放后续范围。',{exact:true}).waitFor();checks.push('未开放任务阻断');
  await page.getByRole('button',{name:'调整剧情进度',exact:true}).click();await page.getByLabel('进度内容类型').selectOption('summary');await page.getByLabel('查找讲解范围').fill('自由之都');await page.getByRole('radio',{name:/讲到「自由之都」/}).check();await page.getByRole('button',{name:'确认剧情范围'}).click();await page.getByRole('button',{name:'安柏为什么送旅行者风之翼？',exact:true}).waitFor();assert.equal(await page.locator('.message').count(),0);await page.getByRole('button',{name:'安柏为什么送旅行者风之翼？',exact:true}).click();await page.locator('.source-chips').waitFor();await page.screenshot({path:join(out,'03-conversation.png'),fullPage:true});checks.push('主动开放进度、清空旧上下文、后续剧情问答');
  await page.getByRole('button',{name:'旅程档案',exact:true}).click();await page.locator('.record-card').last().waitFor();assert.equal(await page.locator('.record-card').count(),14);await page.getByLabel('搜索剧情资料').fill('应急食品');assert.ok(await page.locator('.record-card').count()>=1);await page.locator('.record-card').first().click();await page.locator('.branch-note').waitFor();await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('档案搜索与分支说明');
  await page.getByRole('button',{name:'资料图鉴',exact:true}).click();await page.getByRole('heading',{name:'资料图鉴',exact:true}).waitFor();assert.equal(await page.locator('.reference-grid article').count(),3);await page.screenshot({path:join(out,'04-reference.png'),fullPage:true});checks.push('角色、武器、圣遗物固定页面占位');
  await page.getByRole('button',{name:'模型与偏好',exact:true}).click();await page.getByRole('radio',{name:/在线模型讲解/}).check();await page.getByLabel('服务地址',{exact:true}).fill(`http://127.0.0.1:${mock.address().port}/v1`);await page.getByLabel('模型名称',{exact:true}).fill('test-model');await page.getByLabel('API Key',{exact:true}).fill('test-ui-placeholder-not-real');await page.getByRole('button',{name:'保存并测试连接',exact:true}).click();await page.getByText('连接成功，可以开始剧情讲解。',{exact:true}).waitFor();assert.equal(await page.getByLabel('API Key',{exact:true}).inputValue(),'');assert.doesNotMatch(await page.content(),/test-ui-placeholder-not-real/);await page.screenshot({path:join(out,'05-model-settings.png'),fullPage:true});checks.push('本地填写密钥、连接测试与不回显');
  await page.reload();await page.getByRole('heading',{name:'模型与偏好',exact:true}).waitFor();assert.equal(await page.getByLabel('API Key',{exact:true}).inputValue(),'');checks.push('刷新后设置与会话保留');
  await page.getByRole('button',{name:/开启一段对话/}).click();await page.getByLabel('输入剧情问题').fill('安柏为什么怀疑旅行者？');await page.getByRole('button',{name:'发送问题'}).click();await page.getByText('AI 讲解',{exact:true}).waitFor();await page.getByText('她正在执行巡查职责，需要先了解陌生旅人的来历。',{exact:false}).waitFor();assert.ok(requests>=2);checks.push('在线模型协议端到端（本机模拟服务）');
  providerFails=true;await page.getByLabel('输入剧情问题').fill('安柏为什么怀疑旅行者？');await page.getByRole('button',{name:'发送问题'}).click();await page.locator('.answer-warning').last().waitFor();assert.match(await page.locator('.answer-warning').last().innerText(),/密钥/);checks.push('模型报错展示明确提示并回退');
  await page.setViewportSize({width:430,height:900});await page.waitForTimeout(250);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(out,'06-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));const composer=await page.locator('.composer').boundingBox();assert.ok(composer.y+composer.height<=905);assert.ok((await page.locator('.topbar').boundingBox()).y>=0);checks.push('窄屏无横向溢出，顶部导航和输入框均在窗口内');
  assert.deepEqual(errors,[]);checks.push('无前端运行时错误');
  writeFileSync(join(out,'ui-report.json'),JSON.stringify({passed:true,checks,errors,provider:'local mock; no real account request',screenshots:6},null,2));
  console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){writeFileSync(join(out,'ui-report.json'),JSON.stringify({passed:false,checks,errors,error:error.message},null,2));throw error;}
finally{await browser?.close();await service.close();mock.closeAllConnections();await new Promise(r=>mock.close(r));}
