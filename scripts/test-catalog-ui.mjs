import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createApp} from '../server/app.mjs';
const root=resolve('.'),out=join(root,'test-results');mkdirSync(out,{recursive:true});
const app=await createApp({root,dataDir:mkdtempSync(join(out,'catalog-ui-data-'))}),checks=[],errors=[];
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync)});
 const page=await browser.newPage({viewport:{width:1360,height:960},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(app.origin);await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.locator('.catalog-row').first().waitFor();assert.equal(await page.locator('.catalog-row').count(),40);await page.screenshot({path:join(out,'09-catalog.png'),fullPage:true});checks.push('全部目录接入与分页首屏');
 await page.getByLabel('目录类型').selectOption('archon');await page.getByText('找到 51 条记录',{exact:true}).waitFor();await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.catalog-row').length===11);checks.push('主线类型筛选与翻页');
 await page.getByLabel('搜索全部剧情目录').fill('不存在的查询xyz');await page.getByRole('heading',{name:'没有匹配的目录'}).waitFor();checks.push('无匹配目录反馈');
 await page.getByLabel('目录类型').selectOption('npc');await page.getByLabel('搜索全部剧情目录').fill('提米');await page.locator('.catalog-row').first().waitFor();await page.locator('.catalog-row').first().click();await page.getByRole('heading',{name:'提米',exact:true}).waitFor();assert.match(await page.locator('.catalog-detail').innerText(),/身份|同名/);await page.locator('.catalog-detail .topic-button').filter({hasText:'提米的信与大人的隐瞒'}).click();await page.getByRole('button',{name:'按此范围开始对话'}).click();
 await page.getByRole('button',{name:'提米为什么要给父亲写信？',exact:true}).click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/蒲公英/);await page.getByRole('button',{name:'查看出处 1',exact:true}).first().click();assert.match(await page.locator('.evidence-drawer').innerText(),/与杜拉夫、葛瑞丝、提米对话/);await page.screenshot({path:join(out,'10-expanded-evidence.png'),fullPage:true});await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('NPC 目录关联摘要、选择范围、新建对话、回答与出处');
 await page.getByLabel('输入剧情问题').fill('再详细讲讲');await page.getByRole('button',{name:'发送问题'}).click();await page.locator('.message.assistant').nth(1).locator('.source-chips').waitFor();await page.getByRole('button',{name:'旅程档案',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.record-card').length===4);assert.doesNotMatch(await page.locator('.record-grid').innerText(),/侦察骑士|阿芬迪/);checks.push('独立主题追问和档案隔离');
 await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.getByLabel('搜索全部剧情目录').fill('阿芬迪');await page.locator('.matching-topics .topic-button').filter({hasText:'阿芬迪与三十人团的招募'}).waitFor();checks.push('原目录缺失人物仍可按名称查到独立摘要主题');
 await page.getByLabel('搜索全部剧情目录').fill('空月之歌');await page.locator('.matching-topics .topic-button').filter({hasText:'按来源的序奏'}).click();await page.getByRole('button',{name:'按此范围开始对话'}).click();await page.locator('.question-grid button').first().click();await page.locator('.source-chips').waitFor();assert.match(await page.locator('.answer-body').innerText(),/提纲导览/);await page.getByRole('button',{name:'查看出处 1',exact:true}).first().click();assert.match(await page.locator('.evidence-drawer').innerText(),/MAIN-STORY.md/);await page.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('提纲讲解保留待核对标记与本地文档出处');
 await page.reload();await page.getByRole('heading',{name:'与风同行',exact:true}).waitFor();assert.match(await page.locator('.journey-panel').innerText(),/空月之歌/);assert.equal(await page.locator('.message.assistant').count(),1);checks.push('刷新恢复主题与聊天记录');
 await page.getByRole('button',{name:'剧情目录',exact:true}).click();await page.setViewportSize({width:430,height:900});await page.locator('.catalog-row').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(out,'11-catalog-narrow.png'),fullPage:true});checks.push('目录窄屏布局无横向溢出');
 assert.deepEqual(errors,[]);checks.push('新增界面无运行时错误');
 writeFileSync(join(out,'catalog-ui-report.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(e){writeFileSync(join(out,'catalog-ui-report.json'),JSON.stringify({passed:false,checks,errors,error:e.message},null,2));throw e;}
finally{await browser?.close();await app.close();}
