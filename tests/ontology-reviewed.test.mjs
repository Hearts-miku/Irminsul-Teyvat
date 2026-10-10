import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadCorpus} from '../server/corpus.mjs';
import {installFullOntology} from '../server/ontology-full.mjs';
import {installOntology} from '../server/ontology-chat.mjs';
import {installReviewedOntology,validReview,matchReviewed} from '../server/ontology-reviewed.mjs';
const root=resolve('.'),reviews=JSON.parse(readFileSync('data/ontology/reviewed-ordo.json'));
test('核对记录绑定陈述、来源版本、正文和分支路径，改变任一项即失效',()=>{
 const corpus=loadCorpus(root),pages=new Map(corpus.pages.map(p=>[p.pageid,p]));
 for(const item of [...reviews.entities,...reviews.relations])assert.ok(validReview(item,pages),item.id);
 const item=reviews.relations[0],p=pages.get(item.evidence.pageid);
 assert.equal(validReview({...item,claim:'修改了结论'},pages),false);
 for(const change of [p=>({...p,revision:-1}),p=>({...p,sha256:'changed'}),p=>({...p,sections:p.sections.map((s,i)=>i===item.evidence.index?{...s,text:s.text+'新增'}:s)}),p=>({...p,sections:p.sections.map((s,i)=>i===item.evidence.index?{...s,path:['另一选项']}:s)})]){
  assert.equal(validReview(item,new Map([...pages,[p.pageid,change(p)]])),false);
 }
 assert.equal(matchReviewed('这里是否安全？',reviews.entities).length,0);
 assert.deepEqual(matchReviewed('4ACV07是谁？',reviews.entities).map(e=>e.id),['seymour']);
});
test('别名合并保留旧会话；关系只使用已开放片段，旧专题不越界读取第三页',()=>{
 const corpus=loadCorpus(root),pack={stages:[...corpus.stages],sources:corpus.sources};
 installOntology(root,pack,corpus);const full=installFullOntology(root,pack,corpus),reviewed=installReviewedOntology(root,pack,corpus);
 const jacob=reviews.entities.find(e=>e.id==='jacob');
 const items=full.query(new URLSearchParams('q=雅各布')).items.filter(e=>jacob.nodeIds.includes(e.id));
 assert.equal(items.length,1);assert.equal(items[0].id,jacob.primaryNodeId);assert.equal(items[0].reviewStatus,'source-reviewed');
 for(const id of jacob.nodeIds){const stage=pack.stages.find(s=>s.entityId===id);const result=reviewed.retrieve('雅各布属于水仙十字结社吗？',{progress:stage.id},corpus.records(stage.id));assert.equal(result.status,'answer');assert.ok(result.records.some(r=>r.reviewedRelationId==='member'));}
 const oldRows=corpus.records(1900000001);
 assert.ok(!oldRows.some(r=>r.reviewedRelationId==='institute-recollection'));
 assert.equal(reviewed.retrieve('安如何回忆水仙十字院？',{progress:1900000001},oldRows).status,'scope');
 const partial=reviewed.retrieve('安有哪些历史经历？',{progress:1900000001},oldRows);
 assert.equal(partial.status,'answer');assert.equal(partial.partial,true);
 assert.equal(reviewed.retrieve('西摩尔的设计者是谁？',{progress:1},[]).status,'scope');
 assert.equal(reviewed.retrieve('完全未收录的虚构对象是谁？',{progress:1900000001},oldRows),null);
 assert.equal(full.retrieve('完全未收录的虚构对象是谁？',{progress:items[0].stageId},{status:'missing',records:[]},[]).status,'missing');
});
