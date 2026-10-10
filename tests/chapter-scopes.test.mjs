import test from 'node:test';
import assert from 'node:assert/strict';
import {chapterScopes} from '../server/chapter-scopes.mjs';
import {loadCorpus} from '../server/corpus.mjs';
import {resolve} from 'node:path';
test('主线只关联明确归属，保留标题中的中文逗号，不模糊匹配',()=>{
 const page=(pageid,title,series='')=>({pageid,title,series,sections:[{path:[],text:'正文'}]});
 const scopes=chapterScopes([page(1,'不动鸣神，恒常乐土'),page(2,'子任务','第二章,不动鸣神，恒常乐土'),page(3,'相似标题','第二章,不动鸣神'),page(4,'另一章','第三章')],[{kind:'archon',title:'不动鸣神，恒常乐土',chapter:'第二章 第一幕',region:'稻妻'}]);
 assert.deepEqual(scopes[0].children.map(p=>p.pageid),[2]);assert.equal(scopes[0].id,2000000001);
});
test('主线新范围包含子任务与各自出处，旧单页范围不被扩张',()=>{
 const corpus=loadCorpus(resolve('.')),stages=corpus.stages;
 const chapter=stages.find(s=>s.isMainChapter&&s.title==='不动鸣神，恒常乐土'),single=stages.find(s=>!s.isMainChapter&&s.title===chapter.title);
 assert.ok(chapter.childCount>=8);assert.notEqual(chapter.id,single.id);
 const records=corpus.records(chapter.id);assert.ok(records.some(r=>r.task==='离岛逃离计划'));assert.ok(records.every(r=>r.stage===chapter.id));
 assert.ok(new Set(records.map(r=>r.sourceId)).size>1);assert.equal(new Set(corpus.records(single.id).map(r=>r.sourceId)).size,1);
 assert.ok(!records.some(r=>r.task==='独舞者的序幕'));
 assert.equal(stages.filter(s=>s.isMainChapter).length,51);
 assert.ok(stages.some(s=>s.isMainChapter&&s.title==='往冥府的安魂歌'));
});

import {retrieve} from '../server/retrieval.mjs';
test('主线进度累计此前章节，回退后关闭后续章节，间章按阅读顺序穿插',()=>{
 const c=loadCorpus(resolve('.')),main=c.stages.filter(s=>s.isMainChapter),find=t=>main.find(s=>s.title===t);
 const current=find('不动鸣神，恒常乐土'),rows=c.records(current.id);
 assert.ok(rows.some(r=>r.task==='请仙'));assert.ok(rows.some(r=>r.task==='骑士的现场教习'));assert.ok(!rows.some(r=>r.task==='独舞者的序幕'));assert.equal(rows.length,new Set(rows.map(r=>r.id)).size);
 const early=find('捕风的异乡人'),earlyRows=c.records(early.id);assert.ok(!earlyRows.some(r=>r.task==='请仙'));assert.ok(!earlyRows.some(r=>r.task==='离岛逃离计划'));
 const result=retrieve('请仙典仪发生了什么？',{progress:current.id,context:{}},rows,{stages:c.stages,sources:c.sources});assert.equal(result.status,'answer');assert.ok(result.records.some(r=>r.task==='请仙'));assert.ok(result.records.every(r=>r.stage===current.id));
 for(const [title,before,after]of [['风起鹤归','千手百眼，天下人间','回响渊底的安魂曲'],['危途疑踪','回响渊底的安魂曲','穿越烟帷与暗林'],['倾落伽蓝','虚空鼓动，劫火高扬','卡利贝尔'],['悖理','炽烈的还魂诗','你存在的时空']]){assert.ok(find(before).chapterOrder<find(title).chapterOrder);assert.ok(find(title).chapterOrder<find(after).chapterOrder);}
});
