import test from 'node:test';import assert from 'node:assert/strict';
import {applyLoreLinks} from '../scripts/lib/lore-links.mjs';import {digest} from '../scripts/lib/story-sources.mjs';
test('世界观补充保留分支与来源，来源变化时拒绝套用',()=>{
 const fragment={path:['任务剧情','完成任务后','选项 1'],text:'花灵的记忆'};
 const pages=[{pageid:1,title:'人物',revision:2,sha256:'a',sections:[]},{pageid:3,title:'任务',revision:4,sha256:'b',sections:[fragment]}];
 const links=[{pageid:1,revision:2,sha256:'a',links:[{pageid:3,revision:4,sha256:'b',fragments:[{index:0,hash:digest(JSON.stringify([fragment.path,fragment.text]))}]}]}];
 const actual=structuredClone(pages);applyLoreLinks(actual,links);assert.deepEqual(actual[0].sections[0].path.slice(2),fragment.path);assert.equal(actual[0].sections[0].origin.pageid,3);assert.equal(actual[1].sections.length,1);
 const changed=structuredClone(pages);changed[1].revision++;assert.throws(()=>applyLoreLinks(changed,links),/来源变化/);
 const changedText=structuredClone(pages);changedText[1].sections[0].text='另一句话';assert.throws(()=>applyLoreLinks(changedText,links),/片段变化/);
});

import {loadCorpus} from '../server/corpus.mjs';import {retrieve} from '../server/retrieval.mjs';import {resolve} from 'node:path';
test('世界观入口可问答并引用关联任务，不跨到无关页面',()=>{
 const corpus=loadCorpus(resolve('.')),pack={stages:corpus.stages,sources:corpus.sources};
 for(const [title,question,source] of [['菲多赫','净光翎是什么？','甘露之心'],['瑟法娜','净觉花与花灵有什么关系？','丰饶之海'],['唤醒「灵谷木」中的残灵','祖尔宛怎么解释花灵与甘露的关系？','微暗之火'],['「式大将」','晴之介为什么离开？','痴念虚错拂袖去'],['有乐斋','有乐斋与八重神子有什么关系？','百年一梦'],['韶光抚月','锅巴为什么失去了力量？','六情通七仙贺八方飘香九霄得闻十分完满']]){
  const stage=corpus.stages.find(s=>s.title===title),records=corpus.records(stage.id),r=retrieve(question,{progress:stage.id,context:{}},records,pack);assert.equal(r.status,'answer',title);assert.ok(r.records.some(r=>pack.sources.find(s=>s.id===r.sourceId)?.title===source),title);assert.ok(r.records.every(r=>r.stage===stage.id));
 }
});
