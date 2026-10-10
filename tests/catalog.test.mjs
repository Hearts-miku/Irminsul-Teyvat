import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {loadPack,createStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {loadCatalog} from '../server/catalog.mjs';
import {retrieve,offlineSections,evidenceView} from '../server/retrieval.mjs';
import {buildMessages,validateAnswer} from '../server/model.mjs';
const root=resolve('.'),pack=loadPack(join(root,'data/program-content.json')),catalog=loadCatalog(join(root,'data/catalog/program-index.json'));
mkdirSync(join(root,'.cache/tests'),{recursive:true});
const directory=()=>mkdtempSync(join(root,'.cache/tests/expanded-'));
test('目录保留全部源记录与来源状态，摘要关联不冒充正文完成',()=>{
 const original=JSON.parse(readFileSync('data/catalog/index-snapshot.json','utf8'));const current=JSON.parse(readFileSync('data/catalog/program-index.json','utf8'));
 assert.equal(current.items.length,original.items.length);assert.equal(current.items.length,3472);
 for(const item of current.items){const old=original.items.find(i=>i.id===item.id);assert.deepEqual(Object.fromEntries(Object.keys(old).map(k=>[k,item[k]])),old);for(const id of [...item.guideIds,...item.summaryIds])assert.ok(pack.stages.some(s=>s.id===id));assert.equal(item.dialogueStatus,'pending');}
 assert.equal(catalog.query(new URLSearchParams('kind=archon')).total,51);assert.equal(catalog.query(new URLSearchParams('kind=npc')).total,2139);
});
test('检索处理标点、过滤、分页和无匹配内容',()=>{
 const found=catalog.query(new URLSearchParams({q:'不动鸣神恒常乐土'}));assert.ok(found.items.some(i=>i.kind==='archon'));
 const p=catalog.query(new URLSearchParams('page=999999'));assert.ok(p.page*p.pageSize>=p.total);assert.equal(catalog.query(new URLSearchParams('q=not-existing-abcdef')).total,0);
 const pending=catalog.query(new URLSearchParams('availability=pending'));assert.ok(pending.items.every(i=>!i.summaryIds.length&&!i.guideIds.length));
});
test('内容更新保留旧会话，独立主题不会累积其他地区证据',()=>{
 const dir=directory(),old=loadPack(join(root,'data/mondstadt-prologue.json'));let store=createStore(dir,old);const s=store.createSession(2);store.append(s.id,'user',{text:'旧对话'});store.saveSettings({mode:'offline',model:'saved-model'});store.close();
 store=createStore(dir,pack);try{assert.equal(store.messages(s.id)[0].text,'旧对话');assert.equal(store.settings().model,'saved-model');assert.equal(store.records(3).length,14);assert.ok(store.records(102).every(r=>r.stage===102));assert.equal(store.records(102).length,3);}finally{store.close();}
});
test('扩展主题可问答和追问，模型允许本范围内的须弥内容',()=>{
 const first=retrieve('阿芬迪为什么招募旅行者？',{progress:102,context:{}},pack.records,pack);assert.equal(first.status,'answer');assert.ok(first.records.some(r=>r.topic==='招募旅行者的原因'));assert.ok(first.records.every(r=>r.stage===102));
 const follow=retrieve('再详细讲讲',{progress:102,context:first.context},pack.records,pack);assert.equal(follow.status,'answer');assert.deepEqual(follow.records.map(r=>r.id).sort(),first.records.map(r=>r.id).sort());
 const payload=JSON.parse(buildMessages('为什么',first,[],'normal')[1].content);assert.ok(payload.evidence.every(r=>r.id.startsWith('story-102-')));
 assert.equal(validateAnswer(JSON.stringify({sections:[{kind:'fact',text:'三十人团承担须弥城防卫与生活事务。',citationIds:[first.records[0].id]}]}),first,102).length,1);
 assert.throws(()=>validateAnswer(JSON.stringify({sections:[{kind:'fact',text:'伪造',citationIds:['story-101-1']}]}),first,102));
});
test('提纲与摘要明确区分，未核对事项不会变成正文',()=>{
 const scope=pack.stages.find(s=>s.title.startsWith('空月之歌'));assert.ok(scope);const result=retrieve(scope.suggestions[0],{progress:scope.id,context:{}},pack.records,pack);
 assert.equal(result.contentType,'outline');assert.match(offlineSections(result,'normal')[0].text,/提纲/);assert.ok(result.records.every(r=>r.contentType==='outline'));assert.match(buildMessages('解释',result,[],'normal')[0].content,/待核对项不是已发生的事实/);
 assert.equal(evidenceView(result.records[0],pack).source.localDocument,'docs/story-outline/MAIN-STORY.md');
});
test('范围外、未知细节与全文请求不自动补写',()=>{
 const ask=q=>retrieve(q,{progress:102,context:{}},pack.records,pack);
 assert.equal(ask('概括提米的信与大人的隐瞒').status,'scope');assert.equal(ask('阿芬迪的生日').status,'missing');assert.equal(ask('阿芬迪全部台词').status,'missing');assert.equal(ask('纳西妲技能倍率').status,'reference');
});
test('目录与新范围在 HTTP 中可用，无法越界读取，切换清除旧上下文',async t=>{
 const app=await createApp({root,dataDir:directory()});t.after(()=>app.close());
 const req=async(path,method='GET',body)=>{const r=await fetch(app.origin+path,{method,headers:{'X-App-Token':app.token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 assert.equal((await fetch(app.origin+'/api/catalog')).status,401);const results=(await req('/api/catalog?q=提米&kind=npc')).data;assert.ok(results.total>0);assert.ok(results.items.some(i=>i.summaryIds.includes(101)));
 const s=(await req('/api/sessions','POST',{progress:102})).data.session;assert.equal((await req(`/api/evidence/story-101-1?sessionId=${s.id}`)).status,404);assert.equal((await req(`/api/evidence/story-102-1?sessionId=${s.id}`)).status,200);
 const chat=await fetch(app.origin+'/api/chat',{method:'POST',headers:{'X-App-Token':app.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId:s.id,question:'阿芬迪为什么招募旅行者？'})});const answer=await chat.text();assert.match(answer,/招募旅行者的原因/);assert.doesNotMatch(answer,/story-101-/);
 const changed=(await req(`/api/sessions/${s.id}`,'PATCH',{progress:1})).data;assert.equal(changed.messages.length,0);assert.deepEqual(changed.session.context,{});assert.equal((await req(`/api/evidence/story-102-1?sessionId=${s.id}`)).status,404);
 assert.equal((await req('/api/sessions','POST',{progress:999})).status,400);
});
