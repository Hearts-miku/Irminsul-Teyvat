import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {apiAllowed,apiUrl,requestJson,validatePlan,extractSections} from '../scripts/lib/story-sources.mjs';
import {validateChapter,loadChapters} from '../scripts/lib/content-validation.mjs';
test('采集清单拒绝重复、越界路径和批量注入标题',()=>{
 for(const p of [{id:'../x',pages:[{key:'a',title:'a'}]},{id:'x',pages:[{key:'a',title:'a|b'}]},{id:'x',pages:[{key:'a',title:'a'},{key:'a',title:'b'}]}])assert.throws(()=>validatePlan(p));
 assert.equal(validatePlan(JSON.parse(readFileSync('data/collection-plans/journey-bridge.json'))).pages.length,10);
});
test('robots 规则优先级与 API 查询路径检查',()=>{
 assert.equal(apiAllowed('User-agent: *\nDisallow: /*index.php?*\nDisallow: /*oldid=*'),true);
 assert.equal(apiAllowed('User-agent: *\nDisallow: /ys/'),false);
 assert.equal(apiAllowed('User-agent: *\nDisallow: /ys/\nAllow: /ys/api.php'),true);
 assert.equal(apiAllowed('User-agent: *\nAllow: /\nUser-agent: WindborneStoriesPrototype\nDisallow: /'),false);
 assert.equal(apiAllowed('User-agent: *\nDisallow: /*action=query*',apiUrl({action:'query'})),false);
});
test('只读 API 对限流与 maxlag 有有限退避，错误不当正文',async()=>{
 let calls=0;const delays=[];const fetcher=async()=>{calls++;return calls===1?new Response('',{status:429,headers:{'retry-after':'2'}}):calls===2?Response.json({error:{code:'maxlag'}}):Response.json({parse:{revid:1}});};
 assert.equal((await requestJson({action:'parse'},{fetcher,sleep:async n=>delays.push(n)})).parse.revid,1);assert.equal(calls,3);assert.equal(delays.length,2);
 await assert.rejects(()=>requestJson({},{fetcher:async()=>Response.json({error:{code:'missingtitle',info:'missing'}})}),/missingtitle/);
});
test('草稿、来源变动和丢失场景不能通过入库校验',()=>{
 const c=JSON.parse(readFileSync('data/journey-bridge-story.json')),r=JSON.parse(readFileSync('data/source-receipts/journey-bridge.json'));
 assert.equal(loadChapters().length,3);assert.doesNotThrow(()=>validateChapter(c,r));
 const draft=structuredClone(c);draft.reviewStatus='unreviewed';assert.throws(()=>validateChapter(draft,r),/未核对/);
 const changed=structuredClone(c);changed.sources.dain.snapshotSha256='changed';assert.throws(()=>validateChapter(changed,r),/快照/);
 const missing=structuredClone(c);missing.scopes[0].records[0].evidenceAnchors=['missing'];assert.throws(()=>validateChapter(missing,r),/场景/);
});
test('离线 HTML 提取保留重复场景、条件和选项并阻止脚本执行',async()=>{
 const executablePath=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
 const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 try{const ctx=await browser.newContext({javaScriptEnabled:false});await ctx.route('**/*',r=>r.abort());const page=await ctx.newPage();
 const result=await extractSections(page,'<div class="mw-parser-output"><h2 id="plot">任务剧情</h2><h3 id="a">对话</h3><p>未完成任务</p><div>选项一：接受<br>选项二：拒绝</div><h3 id="b">对话</h3><p>已完成任务</p><script>document.body.innerHTML="bad"</script></div>');
 assert.deepEqual(result.map(s=>s.anchor),['a','b']);assert.match(result[0].text,/接受[\s\S]*拒绝/);assert.equal(result[0].requiresBranchReview,true);assert.match(result[1].text,/已完成任务/);assert.doesNotMatch(result[1].text,/innerHTML/);
 }finally{await browser.close();}
});
