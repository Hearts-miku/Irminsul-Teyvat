import test from 'node:test';import assert from 'node:assert/strict';
import {linkSources,sourceTitle} from '../scripts/lib/source-links.mjs';
import {retrieve} from '../server/retrieval.mjs';
test('仅按显式来源准确名称关联，摘要原文关联不冒充事实验证',()=>{
 const p={pageid:1,title:'甲',revision:2,sha256:'x',region:'蒙德',sections:[{text:'原话'}]},pack={stages:[{id:1,sourceId:'s'}],sources:[{id:'s',url:'https://wiki.biligame.com/ys/index.php?title=甲&oldid=2',revision:2}],records:[{id:'r',stage:1,text:'归纳',quote:'原话'}]},items=[{title:'甲'},{title:'甲乙'}];
 const report=linkSources(pack,[p],items);assert.equal(report.matchedQuotes,1);assert.equal(items[0].sourcePages.length,1);assert.equal(items[1].sourcePages.length,0);assert.equal(pack.records[0].sourceAlignment.status,'page-linked-unreviewed');assert.equal(sourceTitle('https://example.com/ys/甲'),null);
});
test('片段 ID 变化后重新匹配当前范围同任务证据，旧文本不复用',()=>{
 const scope={id:10,scopeMode:'independent',contentType:'source',suggestions:[]},pack={stages:[scope]};const record={id:'new',stage:10,task:'约定',topic:'约定之后',keywords:['约定'],text:'甲履行约定。'};const session={progress:10,context:{recordIds:['old'],topic:'约定之后',task:'约定'}};
 const answer=retrieve('再详细讲讲',session,[record,{...record,id:'foreign',stage:11},{...record,id:'other-task',task:'另一个约定'}],pack);assert.equal(answer.status,'answer');assert.deepEqual(answer.records.map(r=>r.id),['new']);assert.deepEqual(answer.context.recordIds,['new']);
 assert.equal(retrieve('再详细讲讲',session,[{...record,stage:11}],pack).status,'missing');assert.equal(retrieve('她后来呢',{progress:10,context:{}},[record],pack).status,'missing');
});

test('目录关联尊重人物类型、来源重定向和明确角色字段',()=>{const pages=[{pageid:1,title:'望月（NPC）',categories:['分类:NPC']},{pageid:2,title:'另一条任务',categories:['分类:游逸旅闻'],series:'逸闻·安柏'},{pageid:3,title:'同名',categories:['分类:NPC']},{pageid:4,title:'「标题」',categories:['分类:任务']}],items=[{title:'望月',kind:'npc'},{title:'安柏逸闻',kind:'anecdote',character:'安柏'},{title:'同名',kind:'world'},{title:'标题',kind:'world'},{title:'标题后续',kind:'world'}];linkSources({stages:[],sources:[],records:[]},pages,items,[{from:'望月',to:'望月（NPC）'}]);assert.equal(items[0].sourcePages[0].relation,'source-redirect');assert.equal(items[1].sourcePages[0].pageid,2);assert.equal(items[2].sourcePages.length,0);assert.equal(items[3].sourcePages[0].pageid,4);assert.equal(items[4].sourcePages.length,0);});
