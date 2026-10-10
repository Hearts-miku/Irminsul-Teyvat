import{_electron as electron}from'playwright';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync}from'node:fs';import{resolve}from'node:path';
const checks=[];for(const mode of ['main','pet']){let app;try{
 const dataDir=mkdtempSync(resolve('test-results/ontology-'+mode+'-'));app=await electron.launch({executablePath:process.env.STORY_PACKAGED_EXE,args:[],env:{...process.env,STORY_DATA_DIR:dataDir,STORY_TEST_MODE:'1'},timeout:45000});
 let main,pet;for(let i=0;i<200;i++){main=app.windows().find(p=>p.url().endsWith('/chat'));pet=app.windows().find(p=>p.url().endsWith('/pet'));if(main&&pet)break;await new Promise(r=>setTimeout(r,100));}await main.getByRole('heading',{name:'与风同行',exact:true}).waitFor();
 const page=mode==='main'?main:pet;if(mode==='pet')await pet.getByRole('button',{name:'展开桌宠对话'}).click();
 const input=page.getByLabel(mode==='main'?'输入剧情问题':'桌宠剧情问题');await input.fill('水仙十字结社是什么');await input.press('Enter');
 const open=page.getByRole('button',{name:/开放水仙十字结社专题/});await open.waitFor();assert.doesNotMatch(await page.locator(mode==='main'?'.answer-body':'.pet-messages').innerText(),/纳齐森科鲁兹|雅各布/);checks.push(mode+' 未开放时不泄露关系');
 await open.click();const citation=page.getByRole('button',{name:mode==='main'?'查看出处 1':'桌宠出处 1',exact:true}).first();await citation.waitFor();assert.match(await page.locator(mode==='main'?'.answer-body':'.pet-messages').innerText(),/纳齐森科鲁兹/);checks.push(mode+' 开放后自动新建专题并回答');
 await citation.click();const drawer=page.locator(mode==='main'?'.evidence-drawer':'.pet-evidence');await drawer.waitFor();assert.match(await drawer.innerText(),/藻海的寻踪/);assert.match(await drawer.innerText(),/卡特皮拉/);await page.getByRole('button',{name:mode==='main'?'关闭出处':'关闭桌宠出处',exact:true}).click();
 await input.fill('继续详细讲讲');await input.press('Enter');await page.getByRole('button',{name:mode==='main'?'停止讲解':'停止桌宠讲解',exact:true}).waitFor({state:'hidden'});checks.push(mode+' 引用及追问通过');
 await app.close();app=undefined;
 }finally{await app?.close();}}
writeFileSync('test-results/ontology-desktop-report.json',JSON.stringify({passed:true,checks,realOnlineModelTested:false},null,2));console.log(JSON.stringify({passed:true,checks}));
