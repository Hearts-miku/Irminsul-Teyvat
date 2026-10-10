import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
let app;const checks=[];
try{
 app=await electron.launch({...(process.env.STORY_PACKAGED_EXE?{executablePath:process.env.STORY_PACKAGED_EXE,args:[]}:{args:[resolve('.')]}),env:{...process.env,STORY_DATA_DIR:mkdtempSync(resolve('test-results/batch02-desktop-')),STORY_TEST_MODE:'1'},timeout:60000});
 let main,pet;for(let i=0;i<300;i++){main=app.windows().find(p=>p.url().endsWith('/chat'));pet=app.windows().find(p=>p.url().endsWith('/pet'));if(main&&pet)break;await new Promise(r=>setTimeout(r,100));}
 await main.getByRole('heading',{name:'与风同行',exact:true}).waitFor();
 const input=main.getByLabel('输入剧情问题');await input.fill('水仙十字院是什么？');await input.press('Enter');
 const open=main.getByRole('button',{name:'开放「水仙十字院」· 机构（含后续剧情）',exact:true});await open.waitFor();assert.doesNotMatch(await main.locator('.answer-body').innerText(),/莉利丝/);checks.push('未开放水仙十字院时不返回院长事实');
 await open.click();await main.getByRole('button',{name:'查看出处 1',exact:true}).first().waitFor();assert.match(await main.locator('.answer-body').innerText(),/孤儿院/);await main.getByRole('button',{name:'查看出处 1',exact:true}).first().click();assert.match(await main.locator('.evidence-drawer').innerText(),/藻海的寻踪/);await main.getByRole('button',{name:'关闭出处',exact:true}).click();checks.push('机构说明和任务原文出处可读');
 async function select(name){await main.getByRole('button',{name:'剧情目录',exact:true}).click();await main.getByRole('button',{name:'实体与名词索引',exact:true}).click();await main.getByLabel('搜索实体与名词').fill(name);const card=main.locator('.ontology-browser .topic-button').filter({has:main.getByText(name,{exact:true})});await card.waitFor();assert.equal(await card.count(),1);await card.click();await main.getByRole('button',{name:'开放实体关联资料（含后续剧情）',exact:true}).click();await main.getByRole('button',{name:'查看出处 1',exact:true}).first().waitFor();}
 await select('阿兰·吉约丹');assert.match(await main.locator('.answer-body').innerText(),/设计者/);checks.push('阿兰相关人物节点合并显示并命中设计者关系');
 await input.fill('阿兰与玛丽安是兄妹吗？');await input.press('Enter');await main.locator('.answer-body').last().getByText(/西摩尔称阿兰与玛丽安为兄妹/).waitFor();checks.push('姓名简称的兄妹关系可直接提问');
 await select('水仙十字圣剑');assert.match(await main.locator('.answer-body').innerText(),/第2个象限/);checks.push('圣剑剧情保留任务分支条件');
 await pet.getByRole('button',{name:'展开桌宠对话'}).click();const petInput=pet.getByLabel('桌宠剧情问题');await petInput.fill('水仙十字圣剑的锻铸材料是什么？');await petInput.press('Enter');await pet.locator('.pet-message.assistant').last().getByText(/四种物质之块/).waitFor();await petInput.fill('继续详细讲讲');await petInput.press('Enter');await pet.getByRole('button',{name:'停止桌宠讲解',exact:true}).waitFor({state:'hidden'});await pet.getByRole('button',{name:'桌宠出处 1',exact:true}).last().click();assert.match(await pet.locator('.pet-evidence').innerText(),/第2个象限/);checks.push('桌宠材料问答与追问保留原文分支出处');
 await select('阿兰·吉约丹的遗作');assert.match(await main.locator('.answer-body').innerText(),/文献作者的判断/);checks.push('遗作完整词组不会被阿兰人物名抢占，保留作者判断');
 await main.screenshot({path:'test-results/batch02-main.png'});await pet.screenshot({path:'test-results/batch02-pet.png'});writeFileSync('test-results/batch02-desktop-report.json',JSON.stringify({passed:true,checks,realOnlineModelTested:false},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(error){for(const [i,page]of(app?.windows()??[]).entries())await page.screenshot({path:'test-results/batch02-failure-'+i+'.png'}).catch(()=>{});throw error;}finally{await app?.close();}
