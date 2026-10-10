import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadCorpus} from '../server/corpus.mjs';
import {loadReviewed,validReview} from '../server/ontology-reviewed.mjs';
import {installFullOntology} from '../server/ontology-full.mjs';
import {createApp} from '../server/app.mjs';
import {evidenceView} from '../server/retrieval.mjs';
const root=resolve('.'),raw=JSON.parse(readFileSync('data/ontology/reviewed-ordo.json'));
const generic=1438630038,excluded=1419933354,task=1352248589,series=1435161081;

test('消歧决定绑定全部证据；任一来源变化或决定被改写后失效',()=>{
 const corpus=loadCorpus(root),pages=new Map(corpus.pages.map(p=>[p.pageid,p]));
 for(const d of raw.decisions){assert.ok(validReview(d,pages));assert.equal(validReview({...d,reason:'另一决定'},pages),false);for(const e of [d.evidence,...(d.supportingEvidence??[])])assert.equal(validReview(d,new Map([...pages,[e.pageid,{...pages.get(e.pageid),revision:-1}]])),false);}
 const changed=corpus.pages.map(p=>p.pageid===99593?{...p,revision:-1}:p);
 assert.ok(!loadReviewed(root,changed).decisions.some(d=>d.action==='distinguish'));
 const backlog=JSON.parse(readFileSync('data/ontology/backlog.json'));assert.equal(backlog.summary.thirdStepComplete,true);assert.ok(!backlog.tasks.some(t=>t.priority==='P0'&&t.status==='pending'));
});

test('目录排除整句、泛称仅导航、任务和系列按各自来源分开',()=>{
 const corpus=loadCorpus(root),pack={stages:[...corpus.stages],sources:corpus.sources},api=installFullOntology(root,pack,corpus);
 assert.equal(api.query(new URLSearchParams('q=水仙十字结社和过去的事情有很深的渊源')).total,0);
 const entry=api.query(new URLSearchParams('q=水仙十字')).items.find(n=>n.name==='水仙十字');assert.equal(entry.isDisambiguation,true);assert.equal(entry.evidenceCount,0);
 assert.deepEqual(corpus.records(generic),[]);assert.deepEqual(corpus.records(excluded),[]);
 assert.ok(corpus.records(task).length>100);assert.ok(corpus.records(task).every(r=>r.sourceId==='corpus-source-99581'));
 assert.equal(corpus.records(series).length,7);assert.ok(corpus.records(series).every(r=>r.sourceId==='corpus-source-99593'));
 const directory=api.query(new URLSearchParams('q=水仙十字大冒险'));assert.equal(directory.total,2);assert.deepEqual(new Set(directory.items.map(n=>n.type)),new Set(['单个任务','系列任务']));
 for(const question of ['水仙十字是什么？','介绍一下水仙十字','水仙十字是谁？']){const result=api.resolveDecision(question,{progress:1});assert.equal(result.status,'clarify');assert.equal(result.records.length,0);assert.equal(result.scopeSuggestions.length,7);assert.ok(result.scopeSuggestions.every(s=>s.question!==question));}
 const selected=api.resolveDecision('水仙十字大冒险是什么？',{progress:1});assert.equal(selected.status,'clarify');assert.equal(selected.scopeSuggestions.length,2);
 assert.equal(api.resolveDecision('水仙十字大冒险系列任务是什么？',{progress:1}).scopeSuggestions[0].stageId,series);
 assert.equal(api.resolveDecision('水仙十字大冒险单个任务是什么？',{progress:1}).scopeSuggestions[0].stageId,task);
});

test('实际接口选择、连续追问、系列缺正文及历史引用隔离',async t=>{
 const app=await createApp({root,dataDir:mkdtempSync(resolve('test-results/decisions-api-'))});t.after(()=>app.close());const headers={'X-App-Token':app.token,'Content-Type':'application/json'};
 const ask=async(session,question)=>{const r=await fetch(app.origin+'/api/chat',{method:'POST',headers,body:JSON.stringify({sessionId:session.id,question})});assert.ok(r.ok);assert.doesNotMatch(await r.text(),/"type":"error"/);return app.store.messages(session.id).at(-1);};
 const start=app.store.createSession(1),choice=await ask(start,'水仙十字大冒险是什么？');assert.equal(choice.status,'clarify');assert.equal(choice.citations.length,0);
 for(const suggestion of choice.scopeSuggestions){const session=app.store.createSession(suggestion.stageId),answer=await ask(session,suggestion.question);assert.equal(answer.status,'answer');assert.ok(answer.citations.length);assert.ok(answer.citations.every(c=>c.source.title===(suggestion.stageId===series?'「水仙十字大冒险」（系列任务）':'「水仙十字大冒险」')));const follow=await ask(session,'继续详细讲讲');assert.equal(follow.status,'answer');assert.deepEqual(follow.citations.map(c=>c.id),answer.citations.map(c=>c.id));}
 const parent=app.store.createSession(series),noDialogue=await ask(parent,'这个系列有哪些对白？');assert.equal(noDialogue.status,'missing');assert.equal(noDialogue.citations.length,0);assert.match(noDialogue.sections.map(s=>s.text).join(''),/没有独立对白/);assert.equal(noDialogue.scopeSuggestions[0].stageId,task);
 const old=app.store.createSession(excluded),before=app.store.messages(old.id).length;const retired=await ask(old,'这段话是什么？');assert.equal(retired.status,'clarify');assert.equal(retired.citations.length,0);assert.equal(app.store.messages(old.id).length,before+2);
 const page=loadCorpus(root).pages.find(p=>p.pageid===99622),s=page.sections[35];
 const snapshot=evidenceView({id:'ontology-full-99622-35-a57005d8076d',stage:excluded,topic:'旧引用',task:page.title,section:s.path.join(' / '),text:s.text,sourceId:'corpus-source-99622',contentType:'source',entities:[],keywords:[]},app.pack);
 app.store.append(old.id,'assistant',{status:'answer',sections:[],citations:[snapshot]});const response=await fetch(app.origin+'/api/evidence/'+snapshot.id+'?sessionId='+old.id,{headers});assert.equal(response.status,200);assert.match((await response.json()).source.note,/历史引用快照/);
 const fresh=app.store.createSession(excluded);assert.equal((await fetch(app.origin+'/api/evidence/'+snapshot.id+'?sessionId='+fresh.id,{headers})).status,404);
});
