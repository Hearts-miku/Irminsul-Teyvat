import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPack} from '../server/store.mjs';
import {retrieve,evidenceView} from '../server/retrieval.mjs';
import {validateAnswer} from '../server/model.mjs';
const pack=loadPack('data/program-content.json');
const ask=(q,progress,context={})=>retrieve(q,{progress,context},pack.records,pack);
test('璃月三幕保留子任务来源、目录入口与 36 条稳定资料',()=>{
 const input=JSON.parse(readFileSync('data/liyue-story.json')),catalog=JSON.parse(readFileSync('data/catalog/program-index.json'));
 for(const s of input.scopes){assert.ok(catalog.items.some(i=>i.kind==='archon'&&i.summaryIds.includes(s.id)));for(const r of s.records){const stored=pack.records.find(v=>v.id===`story-${s.id}-${r.key}`);assert.ok(stored);const e=evidenceView(stored,pack);assert.equal(e.task,r.task);assert.equal(e.source.title,r.sourceTitle??input.sources[r.sourceKey].title);assert.equal(e.source.verificationLevel,r.sourceVerificationLevel??input.sources[r.sourceKey].verificationLevel);}}
 assert.equal(pack.records.filter(r=>[301,302,303].includes(r.stage)).length,36);
 assert.equal(new Set(pack.records.map(r=>r.id)).size,pack.records.length);
});
test('早期璃月主题拦截身份和结局，模型也受同样约束',()=>{
 for(const [id,q] of [[301,'钟离是谁？'],[301,'帝君是假死吗？'],[302,'钟离的真实身份是什么？'],[302,'凝光为什么放弃群玉阁？']])assert.equal(ask(q,id).status,'spoiler');
 const r=ask('萍姥姥的壶里有什么？',302);
 assert.throws(()=>validateAnswer(JSON.stringify({sections:[{kind:'fact',text:'钟离就是岩神。',citationIds:[r.records[0].id]}]}),r,302),/范围之外/);
 assert.ok(ask('钟离是谁？',303).records.some(r=>r.id==='story-303-identity'));
});
test('每幕概括覆盖收束，后续追问不串幕',()=>{
 for(const id of [301,302,303]){const s=pack.stages.find(s=>s.id===id),r=ask(s.suggestions[0],id);assert.equal(r.records.length,1);assert.equal(r.records[0].overview,true);assert.deepEqual(ask('再详细讲讲',id,r.context).records.map(r=>r.id),r.records.map(r=>r.id));}
 assert.equal(ask('概括迫近的客星这一幕',301).status,'scope');
});
test('璃月人物观点、椰羊误会和交易留白可直接检索',()=>{
 for(const [id,q,key,pattern]of [[301,'仙人怀疑七星就是事实吗？','suspicion',/推断/],[301,'望舒客栈的小冥做了什么？','ghost',/不再捉弄/],[302,'七七说的椰羊真的存在吗？','coconut',/没有证实/],[303,'钟离与冰之女皇交换了什么？','price',/没有公开/],[303,'凝光为什么放弃群玉阁？','sacrifice',/归终机/]]){const r=ask(q,id);assert.equal(r.status,'answer');const hit=r.records.find(r=>r.id===`story-${id}-${key}`);assert.ok(hit,q);assert.match(hit.text,pattern);assert.ok(r.records.every(r=>r.stage===id));}
});
test('子任务归终的来源不会误指向同名人物，完整台词仍不冒充收录',()=>{
 const r=pack.records.find(r=>r.id==='story-302-coconut');assert.match(evidenceView(r,pack).source.url,/667059/);assert.equal(evidenceView(r,pack).source.title,'归终（任务）');
 assert.equal(ask('给我全部台词',303).status,'missing');assert.equal(ask('钟离的技能倍率是多少？',302).status,'reference');
});
