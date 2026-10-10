import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPack} from '../server/store.mjs';
import {retrieve,evidenceView,offlineSections} from '../server/retrieval.mjs';
import {validateAnswer} from '../server/model.mjs';
const pack=loadPack('data/program-content.json');
const ask=(q,progress,context={})=>retrieve(q,{progress,context},pack.records,pack);
test('蒙德三幕入口均关联正文，子任务来源与稳定 ID 完整',()=>{
 const catalog=JSON.parse(readFileSync('data/catalog/program-index.json','utf8'));
 const input=JSON.parse(readFileSync('data/mondstadt-story.json','utf8'));
 for(const s of input.scopes){assert.ok(catalog.items.some(i=>i.kind==='archon'&&i.summaryIds.includes(s.id)));for(const r of s.records){const stored=pack.records.find(v=>v.id===`story-${s.id}-${r.key}`);assert.ok(stored);const ev=evidenceView(stored,pack);assert.equal(ev.source.title,r.sourceTitle??input.sources[r.sourceKey].title);assert.equal(ev.source.verificationLevel,r.sourceTitle?r.sourceVerificationLevel:input.sources[r.sourceKey].verificationLevel);if(r.sourceTitle){assert.equal(ev.source.revision,r.sourceRevision);assert.match(ev.source.url,/oldid=/);assert.equal(stored.semanticReview.status,'source-reviewed');assert.match(ev.source.note,/固定版本来源核对/);}}}
 assert.equal(pack.records.filter(r=>r.stage>=201&&r.stage<=203).length,45);
});
test('全幕回顾使用完整摘要，不只截取开头任务',()=>{
 for(const id of [201,202,203]){const s=pack.stages.find(s=>s.id===id),r=ask(s.suggestions[0],id);assert.equal(r.status,'answer');assert.equal(r.records.length,1);assert.equal(r.records[0].overview,true);assert.equal(offlineSections(r,'normal').length,1);}
 assert.match(ask('概括巨龙与自由之歌这一幕',203).records[0].text,/市民生活/);
});
test('第一幕包含原子任务，但不会自动开放第二幕和第三幕',()=>{
 const own=ask('自由之都为什么送风之翼？',201);assert.equal(own.status,'answer');assert.ok(own.records.some(r=>r.id==='story-201-gift'));
 assert.equal(ask('温迪的身份是什么？',201).status,'spoiler');assert.equal(ask('女士为什么抢神之心？',202).status,'spoiler');assert.equal(ask('天空之琴为什么要修复？',201).status,'spoiler');
});
test('因果问题命中对应依据，追问保留同幕',()=>{
 const tears=ask('为什么要用风龙泪滴修复天空之琴？',202);assert.equal(tears.status,'answer');assert.ok(tears.records.some(r=>r.id==='story-202-depleted-lyre'||r.id==='story-202-purify'));
 const failure=ask('摘星崖的行动为什么失败了？',202);assert.ok(failure.records.some(r=>r.id==='story-202-sabotage'));assert.ok(failure.records.every(r=>r.stage===202));
 const follow=ask('再详细讲讲',202,failure.context);assert.deepEqual(follow.records.map(r=>r.id).sort(),failure.records.map(r=>r.id).sort());
});
test('并行调查、市民态度、幻术修琴保留叙述边界',()=>{
 assert.ok(ask('三座庙宇的调查顺序是什么？',201).records.some(r=>r.id==='story-201-parallel'));
 assert.ok(ask('龙灾结束后蒙德市民怎么说？',203).records.some(r=>r.id==='story-203-citizens'));
 assert.ok(ask('温迪为什么不命令特瓦林继续守护蒙德？',203).records.some(r=>r.id==='story-203-freedom'));
 assert.ok(ask('天空之琴真的修好了吗？',203).records.some(r=>r.id==='story-203-return-lyre'));
});
test('后幕事实即使引用当前幕真实 ID，也会触发有限越界检查',()=>{
 const r=ask('摘星崖的行动为什么失败了？',202);
 assert.throws(()=>validateAnswer(JSON.stringify({sections:[{kind:'fact',text:'女士抢走了神之心。',citationIds:[r.records[0].id]}]}),r,202),/范围之外/);
 const later=ask('女士抢走了什么？',203);assert.equal(later.status,'answer');assert.ok(later.records.some(r=>r.id==='story-203-gnosis'));
 assert.equal(validateAnswer(JSON.stringify({sections:[{kind:'fact',text:'女士夺走了温迪的神之心。',citationIds:['story-203-gnosis']}]}),later,203).length,1);
});
