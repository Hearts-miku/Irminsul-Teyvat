import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{retrieveOntology}from'../server/ontology-pilot.mjs';
const graph=JSON.parse(readFileSync('data/ontology-pilot.json')),pages=JSON.parse(readFileSync('data/corpus/pages.json')).pages;
const ask=(q,allowedPageIds=[122821,110431],g=graph,p=pages)=>retrieveOntology(q,{allowedPageIds},g,p);
test('本体定义检索取得介绍关系和实际对白，过滤场景短选项',()=>{
 for(const q of ['水仙十字结社是什么','介绍一下水仙十字结社','水仙十字结社是个什么组织','水仙十字结社什么来头']){const r=ask(q);assert.equal(r.status,'answer');assert.equal(r.relations.length,4);assert.equal(r.evidence.length,2);assert.match(r.answer,/卡特皮拉/);assert.match(r.answer,/质疑/);assert.ok(r.evidence.every(e=>e.text.length>200));}
});
test('全局定位不越过当前范围、不返回隐藏关系或原文',()=>{
 const r=ask('水仙十字结社是什么',[]);assert.equal(r.status,'scope-required');assert.equal(r.suggestedSources.length,2);assert.deepEqual(r.relations,[]);assert.deepEqual(r.evidence,[]);assert.equal(r.answer,undefined);
 const partial=ask('水仙十字结社是什么',[122821]);assert.equal(partial.partial,true);assert.ok(partial.relations.every(r=>r.evidence.pageid===122821));assert.doesNotMatch(partial.answer,/雅各布/);
});
test('关系意图、未覆盖名词及同名歧义分别处理',()=>{
 assert.deepEqual(ask('水仙十字结社的领袖是谁').relations.map(r=>r.id),['leader-of']);
 assert.deepEqual(ask('水仙十字结社的目的是什么').relations.map(r=>r.id),['purpose']);
 assert.deepEqual(ask('雅各布·英戈德是什么成员').relations.map(r=>r.id),['member']);
 assert.equal(ask('水仙十字是什么').status,'clarify');assert.equal(ask('愚人众是什么').status,'unmatched');
 assert.equal(ask('水仙十字结社成立于哪一年').status,'unsupported');
});
test('修订及片段失效不能继续充当有效知识',()=>{
 const g=structuredClone(graph);for(const r of g.relations)r.evidence.revision++;
 assert.equal(ask('水仙十字结社是什么',undefined,g).status,'stale');
 const p=pages.map(p=>p.pageid===122821?{...p,sections:p.sections.map((s,i)=>i===215?{...s,text:'已变化'}:s)}:p);
 assert.equal(ask('水仙十字结社的领袖是谁',undefined,graph,p).status,'stale');
});
