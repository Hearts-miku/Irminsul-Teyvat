import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
import {installFullOntology} from '../server/ontology-full.mjs';
import {loadCorpus} from '../server/corpus.mjs';
import {fingerprint,classifyIntent} from '../server/ontology-index.mjs';
import {createApp} from '../server/app.mjs';
import {retrieve as retrieveOriginal} from '../server/retrieval.mjs';
const root=resolve('.'),graph=JSON.parse(readFileSync('data/ontology/index.json'));
test('全库覆盖、证据哈希、关系端点、候选决策和稳定 ID 全部一致',()=>{
 const corpus=loadCorpus(root),pages=new Map(corpus.pages.map(p=>[p.pageid,p]));
 assert.equal(graph.pages.length,pages.size);assert.equal(graph.evidence.length,corpus.pages.reduce((v,p)=>v+p.sections.filter(s=>!s.origin).length,0));
 const ids=new Set(graph.nodes.map(n=>n.id));assert.equal(ids.size,graph.nodes.length);assert.equal(new Set(graph.nodes.map(n=>n.stageId)).size,ids.size);
 for(const e of graph.evidence){assert.equal(fingerprint(pages.get(e.pageid).sections[e.index]),e.hash);assert.match(e.recordId,/^corpus-/);}
 for(const n of graph.nodes)for(const i of n.evidence)assert.ok(graph.evidence[i]);
 for(const r of graph.relations){assert.ok(ids.has(r.subject)&&ids.has(r.object)&&graph.evidence[r.evidence]);assert.equal(r.status,'source-field');}
 const decisions=JSON.parse(readFileSync('data/ontology/decisions.json')).decisions;
 assert.equal(decisions.length,graph.summary.candidateNames);assert.ok(decisions.every(d=>d.status==='excluded'||d.entityIds.every(id=>ids.has(id))));
 assert.equal(graph.summary.semanticReviewComplete,false);
});
test('全量检索遵循范围、消歧、追问和过期证据失效',()=>{
 const corpus=loadCorpus(root),pack={stages:[...corpus.stages],sources:corpus.sources};const api=installFullOntology(root,pack,corpus);
 const find=(name,type)=>graph.nodes.find(n=>n.name===name&&(!type||n.type===type));const eye=find('神之眼'),knights=find('西风骑士团','组织或族群');assert.ok(eye&&knights);
 const missing={status:'missing',records:[]};
 const locked=api.retrieve('神之眼是什么？',{progress:1},missing,[]);assert.equal(locked.status,'scope');assert.equal(locked.records.length,0);assert.ok(locked.scopeSuggestions.some(a=>a.stageId===eye.stageId));
 const session={progress:eye.stageId},rows=corpus.records(eye.stageId),answer=api.retrieve('神之眼是什么？',session,missing,rows);assert.equal(answer.status,'answer');assert.ok(answer.records.length);assert.match(answer.records[0].text,/外置魔力器官|外置的魔力器官/);assert.ok(answer.records.every(r=>r.text.includes('神之眼')));
 assert.equal(api.evidenceRecord(answer.records[0].id,{progress:1},[]),null);assert.ok(api.evidenceRecord(answer.records[0].id,session,rows));
 const follow=api.retrieve('继续详细讲讲',{...session,context:answer.context},missing,rows);assert.equal(follow.status,'answer');assert.deepEqual(follow.context.ontologyEntityIds,answer.context.ontologyEntityIds);
 const change=api.retrieve('愚人众是什么？',session,missing,rows);assert.equal(change.status,'scope');assert.equal(change.records.length,0);
 const ambiguous=api.retrieve('西风骑士团是什么？',{progress:1},missing,[]);assert.equal(ambiguous.status,'clarify');assert.ok(ambiguous.scopeSuggestions.length>=2);
 const membership=api.retrieve('西风骑士团有哪些成员？',{progress:knights.stageId},missing,corpus.records(knights.stageId));assert.equal(membership.status,'answer');assert.ok(membership.records.some(r=>r.section==='所属组织'));
 const main=pack.stages.find(s=>s.isMainChapter&&s.title==='不动鸣神，恒常乐土'),mainRows=corpus.records(main.id);const scoped=api.retrieve('神之眼是什么？',{progress:main.id},missing,mainRows);assert.equal(scoped.status,'answer');for(const r of scoped.records)assert.ok(api.evidenceRecord(r.id,{progress:main.id},mainRows));
 assert.equal(api.retrieve('一个完全不在库里的名词是什么？',{progress:1},missing,[]),null);
 assert.equal(classifyIntent('神之眼暴击倍率是什么'),null);
 // Changed source snapshots must never supply new graph evidence.
 const stale={pages:corpus.pages.map(p=>({...p,revision:-1})),records:()=>[]};const staleApi=installFullOntology(root,{stages:[],sources:[]},stale);assert.equal(staleApi.retrieve('神之眼是什么？',session,missing,[]).status,'scope');
 assert.equal(api.query(new URLSearchParams('page=Infinity')).page,10000);
 for(const [title,q,source]of [['菲多赫','净光翎是什么？','甘露之心'],['瑟法娜','净觉花与花灵有什么关系？','丰饶之海'],['「式大将」','晴之介为什么离开？','痴念虚错拂袖去']]){
  const stage=pack.stages.find(s=>s.title===title),rows=corpus.records(stage.id),session={progress:stage.id,context:{}};
  const base=retrieveOriginal(q,session,rows,pack),result=api.retrieve(q,session,base,rows)??base;
  assert.equal(result.status,'answer');assert.ok(result.records.some(r=>r.task===source));assert.deepEqual(result.records.map(r=>r.id),base.records.map(r=>r.id));
 }
});
test('实际接口全量名词索引、范围开放和会话引用',async t=>{
 const app=await createApp({root,dataDir:mkdtempSync(resolve('test-results/ontology-full-api-'))});t.after(()=>app.close());
 const headers={'X-App-Token':app.token,'Content-Type':'application/json'};
 const get=async path=>{const r=await fetch(app.origin+path,{headers});assert.equal(r.status,200);return r.json();};
 const post=async(path,body)=>{const r=await fetch(app.origin+path,{method:'POST',headers,body:JSON.stringify(body)});assert.ok(r.ok);return path==='/api/chat'?r.text():r.json();};
 const result=await get('/api/ontology?q='+encodeURIComponent('神之眼'));assert.ok(result.summary.entities>22000);const entity=result.items.find(n=>n.name==='神之眼');assert.ok(entity);
 const old=await post('/api/sessions',{progress:1});await post('/api/chat',{sessionId:old.session.id,question:'西风骑士团是什么？'});assert.ok(app.store.messages(old.session.id).at(-1).scopeSuggestions.some(s=>s.label.includes('组织或族群')));const fresh=await post('/api/sessions',{progress:entity.stageId});
 const text=await post('/api/chat',{sessionId:fresh.session.id,question:'神之眼是什么？'});assert.match(text,/ontology-full-/);assert.doesNotMatch(text,/"type":"error"/);
 const message=app.store.messages(fresh.session.id).at(-1);assert.ok(message.citations.length);const evidence=await get('/api/evidence/'+message.citations[0].id+'?sessionId='+fresh.session.id);assert.ok(evidence.source.url);assert.match(evidence.text,/神之眼/);
 assert.equal((await fetch(app.origin+'/api/evidence/'+message.citations[0].id+'?sessionId='+old.session.id,{headers})).status,404);
 const boot=await get('/api/bootstrap');assert.ok(boot.pack.stages.length<10000);assert.ok(boot.pack.stages.some(s=>s.id===entity.stageId&&s.isOntology));assert.equal(app.store.messages(old.session.id).length,2);
});
