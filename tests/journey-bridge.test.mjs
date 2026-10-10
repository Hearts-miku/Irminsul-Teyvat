import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPack} from '../server/store.mjs';
import {retrieve,evidenceView} from '../server/retrieval.mjs';
import {validateAnswer} from '../server/model.mjs';
const pack=loadPack('data/program-content.json'),ask=(q,id,context={})=>retrieve(q,{progress:id,context},pack.records,pack);
test('后续三主题含 33 条摘要与具体来源位置',()=>{
 const records=pack.records.filter(r=>[304,305,401].includes(r.stage));assert.equal(records.length,33);
 for(const r of records){const e=evidenceView(r,pack);assert.ok(r.evidenceAnchors.length);assert.match(e.source.url,/oldid=\d+/);assert.ok(e.section);}
});
test('戴因态度题与前置秘密边界',()=>{
 const r=ask('戴因的三个问题有正确答案吗？',304);assert.ok(r.records.some(r=>r.key==='questions'&&/不同选项/.test(r.text)));
 assert.equal(ask('戴因与坎瑞亚是什么关系？',304).status,'spoiler');assert.equal(ask('血亲为什么加入深渊？',304).status,'spoiler');
 assert.throws(()=>validateAnswer(JSON.stringify({sections:[{kind:'fact',text:'戴因是末光之剑。',citationIds:[r.records[0].id]}]}),r,304),/范围之外/);
});
test('计划不冒充成功，血亲地位不冒充最高统治者',()=>{
 assert.ok(ask('命运的织机是什么计划？',305).records.some(r=>r.key==='plan'&&/不能写成已经实施成功/.test(r.text)));
 assert.ok(ask('血亲是最高统治者吗？',305).records.some(r=>r.key==='questions'&&/不确定/.test(r.text)));
 assert.ok(ask('重逢后为什么没有一起回家？',305).records.some(r=>r.key==='home'));
});
test('武斗会 NPC 和条件分支可查询',()=>{
 for(const [q,key] of [['戎世为什么不羡慕神之眼？','rongshi'],['北斗是否第一次见旅行者？','branch'],['万叶为什么没有立刻阻止偷窃？','experiment']])assert.ok(ask(q,401).records.some(r=>r.key===key),q);
 assert.equal(ask('万叶后来挡下那一刀了吗？',401).status,'spoiler');
});
test('整段概括与连续追问保持主题隔离',()=>{
 for(const id of [304,305,401]){const s=pack.stages.find(s=>s.id===id),r=ask(s.suggestions[0],id);assert.equal(r.records.length,1);assert.equal(r.records[0].overview,true);assert.deepEqual(ask('再详细讲讲',id,r.context).records.map(r=>r.id),r.records.map(r=>r.id));}
 assert.equal(ask('概括振袖秋风问红叶',305).status,'scope');
});
