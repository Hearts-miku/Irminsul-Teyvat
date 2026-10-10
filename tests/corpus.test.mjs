import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {splitWiki,parseCorpusText} from '../scripts/lib/corpus-text.mjs';
import {loadCorpus} from '../server/corpus.mjs';
import {createApp} from '../server/app.mjs';
import {retrieve,offlineSections} from '../server/retrieval.mjs';
import {buildMessages,validateAnswer} from '../server/model.mjs';
test('源码解析保留嵌套选项与任务条件，不执行 HTML 或未知模板',()=>{
 assert.deepEqual(splitWiki('a|[[链接|文字]]|{{NPC|名称=甲}}'),['a','[[链接|文字]]','{{NPC|名称=甲}}']);
 const result=parseCorpusText('{{NPC对话|标题=完成任务之后|内容=甲：你好。{{NPC剧情|选项1=关于过去|剧情1=甲：第一条路。{{NPC剧情|选项1=追问原因|剧情1=甲：我的观点。}}|选项2=告别|剧情2=甲：再见。}}}}{{未展开故事}}');
 const first=result.sections.find(s=>s.text.includes('我的观点'));assert.ok(first.path.includes('完成任务之后'));assert.ok(first.path.includes('选项 1：关于过去'));assert.ok(first.path.includes('选项 1：追问原因'));
 const goodbye=result.sections.find(s=>s.text.includes('再见'));assert.ok(goodbye.path.includes('选项 2：告别'));assert.ok(!goodbye.path.includes('选项 1：关于过去'));
 assert.ok(result.unresolvedTemplates.includes('未展开故事'));
 assert.equal(parseCorpusText('{{NPC|内容=未闭合').malformed,true);
 assert.ok(parseCorpusText('{{剧情选项|选项1=好。|剧情1=嗯。}}').sections.some(s=>s.text==='嗯。'));
});
test('场景标题跨选项持续存在，长片段均保留来源上下文',()=>{
 const p=parseCorpusText('==任务剧情==\n===向甲问路===\n甲：从这里出发。{{剧情选项|选项1=好的|选项2=等等}}\n甲：注意路口。\n===抵达目的地===\n乙：欢迎。');
 assert.ok(p.sections.find(s=>s.text.includes('注意路口')).path.includes('向甲问路'));
 assert.ok(p.sections.find(s=>s.text.includes('欢迎')).path.includes('抵达目的地'));
 const long=parseCorpusText('{{NPC对话|标题=雨天|内容='+('雨'.repeat(3500))+'}}');assert.ok(long.sections.length>=3);assert.ok(long.sections.every(s=>s.path.includes('雨天')&&s.text.length<=1400));
});
test('原文包有来源修订与校验，目录页和对白页分别计数',()=>{
 const data=JSON.parse(readFileSync('data/corpus/pages.json','utf8'));assert.equal(data.report.importedPages,data.pages.length);assert.equal(new Set(data.pages.map(p=>p.pageid)).size,data.pages.length);
 assert.equal(data.report.fragments,data.pages.reduce((n,p)=>n+p.sections.length,0));assert.equal(data.report.completeGameCoverage,false);assert.equal(data.report.reviewStatus,'unreviewed-source');
 for(const p of data.pages){assert.ok(p.revision>0);assert.match(p.sha256,/^[a-f0-9]{64}$/);assert.ok(p.sections.every(s=>typeof s.text==='string'&&Array.isArray(s.path)));}
});
test('NPC 原文保留任务前后条件与嵌套问答选项',()=>{
 const corpus=loadCorpus(resolve('.')),entry=corpus.query(new URLSearchParams({q:'长野原龙之介'})).items[0];assert.ok(entry?.hasDialogue);
 const records=corpus.records(entry.stageId);const smoke=records.filter(r=>r.text.includes('五彩斑斓的黑'));assert.equal(smoke.length,2);
 assert.ok(smoke.some(r=>r.section.includes('完成 第二章 第一幕')));assert.ok(smoke.some(r=>r.section.includes('日常对话')));assert.ok(smoke.every(r=>r.section.includes('选项 1：这里有多少种烟花')));
});
test('原文搜索、页面隔离、追问、模型引用和采集状态通过实际接口',async t=>{
 const root=resolve('.'),corpus=loadCorpus(root);const result=corpus.query(new URLSearchParams({q:'独舞者的序幕'}));const entry=result.items.find(p=>p.title==='独舞者的序幕');assert.ok(entry);
 const page=corpus.query(new URLSearchParams({q:'白露与黑潮的序诗'}));assert.ok(page.items.some(p=>p.title==='独舞者的序幕'));
 const full=corpus.query(new URLSearchParams({q:'感人故事',fulltext:'true'}));assert.ok(full.total>0);
 mkdirSync('.cache/tests',{recursive:true});const app=await createApp({root,dataDir:mkdtempSync(join(root,'.cache/tests/corpus-'))});t.after(()=>app.close());
 const headers={'X-App-Token':app.token,'Content-Type':'application/json'};
 const curated=app.pack.stages.find(s=>s.id===305);assert.equal(retrieve(curated.suggestions[0],{progress:305,context:{}},app.store.records(305),app.pack).status,'answer','同名原文页不能阻止精选主题概括');
 assert.equal((await fetch(app.origin+'/api/corpus')).status,401);
 const api=await (await fetch(app.origin+'/api/corpus?q='+encodeURIComponent('独舞者的序幕'),{headers})).json();assert.ok(api.items.some(p=>p.stageId===entry.stageId));
 const session=app.store.createSession(entry.stageId),records=app.store.records(entry.stageId),found=retrieve('为什么把审判当作歌剧？',session,records,app.pack);
 assert.equal(found.contentType,'source');assert.ok(found.records.length);assert.ok(found.records.every(r=>r.stage===entry.stageId));assert.match(offlineSections(found,'normal')[0].text,/尚未逐条核对/);
 const follow=retrieve('再详细讲讲',{...session,context:found.context},records,app.pack);assert.deepEqual(follow.records.map(r=>r.id),records.filter(r=>found.context.recordIds.includes(r.id)).map(r=>r.id));
 assert.match(buildMessages('解释',found,[],'normal')[0].content,/未经逐条核对/);
 assert.throws(()=>validateAnswer(JSON.stringify({sections:[{kind:'fact',text:'越界',citationIds:['story-401-rongshi']}]}),found,entry.stageId));
 const id=found.records[0].id;const evidence=await (await fetch(app.origin+`/api/evidence/${id}?sessionId=${session.id}`,{headers})).json();assert.equal(evidence.source.verificationLevel,'unreviewed-source');assert.match(evidence.source.snapshotSha256,/^[a-f0-9]{64}$/);
 const old=app.store.createSession(1);assert.equal((await fetch(app.origin+`/api/evidence/${id}?sessionId=${old.id}`,{headers})).status,404);
 const response=await fetch(app.origin+'/api/chat',{method:'POST',headers,body:JSON.stringify({sessionId:session.id,question:'审判和歌剧是什么关系？'})});const answer=await response.text();assert.match(answer,/自动解析/);assert.match(answer,/corpus-/);
});

test('跨页书籍的运行时记录使用书籍出处和字段定位，仍隔离在原任务范围',()=>{const corpus=loadCorpus(resolve('.')),scope=1000112183,rows=corpus.records(scope).filter(r=>r.sourceId==='corpus-source-103017');assert.ok(rows.length>0);assert.ok(rows.every(r=>r.stage===scope&&r.task==='《交涉的艺术》'&&r.section.includes('书籍字段：卷1内容')));assert.ok(rows.some(r=>r.text.includes('先声夺人')));const source=corpus.sources.find(s=>s.id===rows[0].sourceId);assert.equal(source.title,'《交涉的艺术》');assert.equal(source.revision,'645056');assert.ok(source.snapshotSha256);assert.equal(corpus.records(1000103017),null);});

test('书中问题仅检索本范围书籍，人物提问不被书籍抢占且追问不越界',()=>{const corpus=loadCorpus(resolve('.')),scope=1000112183,pack={stages:corpus.stages,sources:corpus.sources},records=corpus.records(scope),ask=(q,context={},rows=records)=>retrieve(q,{progress:scope,context},rows,pack);for(const q of ['交涉的艺术 书中如何引导问卷调查？','书中为什么说机会是创造出来的？','《交涉的艺术》讲什么？']){const r=ask(q);assert.equal(r.status,'answer');assert.ok(r.records.every(r=>r.sourceKind==='book'&&r.sourceId==='corpus-source-103017'));}const person=ask('派蒙为什么提到先声夺人？');assert.equal(person.records[0].sourceId,'corpus-source-112183');const switched=ask('继续详细讲书中如何引导问卷调查？',person.context);assert.ok(switched.records.length&&switched.records.every(r=>r.sourceKind==='book'));const follow=ask('再详细讲讲',switched.context);assert.deepEqual(follow.records.map(r=>r.id),switched.records.map(r=>r.id));assert.equal(ask('书中讲什么？',{},records.filter(r=>r.sourceKind!=='book')).status,'missing');assert.equal(ask('《未收录的书》书中讲什么？').status,'missing');const foreign=records.filter(r=>r.sourceKind==='book').map(r=>({...r,stage:scope+1}));assert.equal(ask('书中讲什么？',{},foreign).status,'missing');const another={...records.find(r=>r.sourceKind==='book'),id:'other-book',task:'《另一本书》'};assert.equal(ask('书中讲什么？',{},[...records,another]).status,'missing');});
