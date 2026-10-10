import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
let app;const checks=[];
try{
 app=await electron.launch({...(process.env.STORY_PACKAGED_EXE?{executablePath:process.env.STORY_PACKAGED_EXE,args:[]}:{args:[resolve('.')]}),env:{...process.env,STORY_DATA_DIR:mkdtempSync(resolve('test-results/reviewed-desktop-')),STORY_TEST_MODE:'1'},timeout:60000});
 let main,pet;for(let i=0;i<300;i++){main=app.windows().find(p=>p.url().endsWith('/chat'));pet=app.windows().find(p=>p.url().endsWith('/pet'));if(main&&pet)break;await new Promise(r=>setTimeout(r,100));}
 await main.getByRole('heading',{name:'与风同行',exact:true}).waitFor();
 const input=main.getByLabel('输入剧情问题');await input.fill('西摩尔的设计者是谁？');await input.press('Enter');
 const open=main.getByRole('button',{name:'开放「西摩尔」· 机械造物（含后续剧情）',exact:true});await open.waitFor();assert.doesNotMatch(await main.locator('.answer-body').innerText(),/吉约丹/);checks.push('未开放专题时不泄露设计者');
 await open.click();await main.getByRole('button',{name:'查看出处 1',exact:true}).first().waitFor();assert.match(await main.locator('.answer-body').innerText(),/吉约丹/);checks.push('主窗口关系问答命中设计者');
 await main.getByRole('button',{name:'查看出处 1',exact:true}).first().click();await main.locator('.evidence-drawer').waitFor();assert.match(await main.locator('.evidence-drawer').innerText(),/最后的问题/);assert.match(await main.locator('.evidence-drawer').innerText(),/吉约丹/);await main.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('设计者原文出处可读');
 await main.getByRole('button',{name:'剧情目录',exact:true}).click();await main.getByRole('button',{name:'实体与名词索引',exact:true}).click();
 const search=main.getByLabel('搜索实体与名词');await search.fill('雅各布');const jacob=main.locator('.ontology-browser .topic-button').filter({has:main.getByText('雅各布·英戈德',{exact:true})});await jacob.first().waitFor();assert.equal(await jacob.count(),1);assert.equal(await main.locator('.ontology-browser .topic-button').filter({has:main.getByText('雅各布',{exact:true})}).count(),0);assert.match(await jacob.innerText(),/分类／别名已核对/);checks.push('雅各布简称与全名只显示一个已核对对象');
 await search.fill('4ACV07');const seymour=main.locator('.ontology-browser .topic-button').filter({has:main.getByText('西摩尔',{exact:true})});await seymour.waitFor();await seymour.click();await main.getByRole('button',{name:'开放实体关联资料（含后续剧情）',exact:true}).click();await main.getByRole('button',{name:'查看出处 1',exact:true}).first().waitFor();assert.match(await main.locator('.answer-body').innerText(),/4ACV07/);checks.push('编号别名能搜索并开放西摩尔');
 await pet.getByRole('button',{name:'展开桌宠对话'}).click();const petInput=pet.getByLabel('桌宠剧情问题');await petInput.fill('西摩尔的设计者是谁？');await petInput.press('Enter');await pet.getByRole('button',{name:'桌宠出处 1',exact:true}).last().waitFor();assert.match(await pet.locator('.pet-message.assistant').last().innerText(),/吉约丹/);checks.push('桌宠直接回答已核对关系');
 await petInput.fill('继续详细讲讲');await petInput.press('Enter');await pet.getByRole('button',{name:'停止桌宠讲解',exact:true}).waitFor({state:'hidden'});await pet.getByRole('button',{name:'桌宠出处 1',exact:true}).last().click();assert.match(await pet.locator('.pet-evidence').innerText(),/吉约丹/);checks.push('桌宠连续追问保留关系和出处');
 await main.screenshot({path:'test-results/reviewed-main.png'});await pet.screenshot({path:'test-results/reviewed-pet.png'});writeFileSync('test-results/reviewed-desktop-report.json',JSON.stringify({passed:true,checks,realOnlineModelTested:false},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(error){for(const [i,page]of(app?.windows()??[]).entries())await page.screenshot({path:'test-results/reviewed-failure-'+i+'.png'}).catch(()=>{});throw error;}finally{await app?.close();}
