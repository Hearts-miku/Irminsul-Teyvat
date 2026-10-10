import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const d=JSON.parse(readFileSync(join(root,'data/catalog/index-snapshot.json'),'utf8'));
const checks=[];
assert.equal(new Set(d.items.map(i=>i.id)).size,d.items.length);
for(const i of d.items){assert.ok(i.title.trim());assert.ok(d.sources.find(s=>s.id===i.sourceId&&s.status==='read'));assert.equal(i.dialogueStatus,'pending');assert.equal(new URL(i.sourceUrl).hostname,'wiki.biligame.com');}
for(const s of d.sources){assert.equal(s.extractedIndexSha256,createHash('sha256').update(JSON.stringify(d.items.filter(i=>i.sourceId===s.id))).digest('hex'));}
for(const title of ['流浪者的足迹','捕风的异乡人','卡利贝尔','悖理','森林书','神樱大祓','提米','「寝子」','白夜似梦初醒'])assert.ok(d.items.some(i=>i.title===title),'Missing '+title);
assert.equal(d.items.find(i=>i.title==='身土坏空，五蕴识转').region,'须弥');
assert.ok(d.sources.some(s=>s.title==='NPC图鉴/须弥'&&s.status==='unavailable'));
checks.push('索引 ID、来源关联、元数据哈希、代表任务与待核对状态有效');
const docs=join(root,'docs/story-outline');for(const name of readdirSync(docs).filter(n=>n.endsWith('.md'))){const body=readFileSync(join(docs,name),'utf8');for(const m of body.matchAll(/\]\(([^)]+)\)/g)){if(/^(https?:|#)/.test(m[1]))continue;assert.ok(existsSync(resolve(docs,m[1].split('#')[0])),name+' broken link '+m[1]);}}
checks.push('全部本地 Markdown 交叉链接可定位');
const exe=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
 await context.route(/^https?:/,r=>r.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(join(docs,'catalog.html')).href);
 assert.equal(await page.locator('#count-all').innerText(),d.items.length.toLocaleString());
 await page.screenshot({path:join(out,'story-catalog-overview.png'),fullPage:false});checks.push('直接以 file URL 离线打开，无网络依赖');
 await page.getByLabel('内容类型').selectOption('archon');assert.match(await page.locator('#result-count').innerText(),/51 条/);checks.push('主线类型筛选包含 51 条章节与开篇入口');
 await page.getByRole('button',{name:'重置筛选'}).click();await page.getByLabel('搜索剧情、人物或地点').fill('森林书');assert.ok(await page.locator('#rows tr').count()>0);await page.getByRole('button',{name:'森林书',exact:true}).first().click();assert.equal(await page.locator('#detail-name').innerText(),'森林书');assert.ok(await page.locator('#detail-fields a').count()===2);checks.push('搜索任务可展开具体来源');
 await page.getByRole('button',{name:'重置筛选'}).click();await page.getByLabel('内容类型').selectOption('npc');await page.getByLabel('搜索剧情、人物或地点').fill('提米');assert.ok(await page.locator('#rows tr').count()>0);
 const count=await page.locator('#rows tr').count();const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出筛选结果 JSON'}).click();const path=join(out,'story-catalog-filtered.json');await(await download).saveAs(path);const exported=JSON.parse(readFileSync(path));assert.equal(exported.items.length,count);assert.ok(exported.items.every(i=>i.kind==='npc'&&i.title.includes('提米')));assert.ok(exported.sources.length>0);checks.push('NPC 筛选、同名记录保留及含出处的 JSON 导出');
 await page.getByRole('button',{name:'提米',exact:true}).first().click();await page.screenshot({path:join(out,'story-catalog-npc.png'),fullPage:false});
 await page.getByLabel('搜索剧情、人物或地点').fill('不存在的内容xyz98765');assert.equal(await page.locator('#empty').isVisible(),true);assert.equal(await page.locator('#next').isDisabled(),true);checks.push('无结果状态及分页按钮正确');
 await page.getByRole('button',{name:'重置筛选'}).click();const first=await page.locator('#rows tr').first().innerText();await page.getByRole('button',{name:'下一页',exact:true}).click();assert.notEqual(await page.locator('#rows tr').first().innerText(),first);checks.push('分页切换可访问后续目录');
 await page.setViewportSize({width:430,height:900});await page.evaluate(()=>window.scrollTo(0,0));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:join(out,'story-catalog-narrow.png'),fullPage:false});assert.deepEqual(errors,[]);checks.push('窄屏正文无横向溢出，页面无脚本错误');
 writeFileSync(join(out,'story-catalog-report.json'),JSON.stringify({passed:true,indexEntries:d.items.length,checks,dialogueCorpusComplete:false},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();}
