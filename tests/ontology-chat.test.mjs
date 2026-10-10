import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync}from'node:fs';import{resolve}from'node:path';import{createApp}from'../server/app.mjs';import{buildMessages}from'../server/model.mjs';
test('实际聊天接口先提示范围，专题回答、追问与证据可读取',async t=>{
 const app=await createApp({root:resolve('.'),dataDir:mkdtempSync(resolve('test-results/ontology-api-'))});t.after(()=>app.close());const headers={'X-App-Token':app.token,'Content-Type':'application/json'};
 const call=async(path,body)=>{const r=await fetch(app.origin+path,{method:'POST',headers,body:JSON.stringify(body)});assert.ok(r.ok);return path==='/api/chat'?r.text():r.json();};
 const old=await call('/api/sessions',{progress:1});const locked=await call('/api/chat',{sessionId:old.session.id,question:'水仙十字结社是什么'});assert.match(locked,/开放水仙十字结社专题/);assert.doesNotMatch(locked,/纳齐森科鲁兹|雅各布/);
 const fresh=await call('/api/sessions',{progress:1900000001});const answer=await call('/api/chat',{sessionId:fresh.session.id,question:'水仙十字结社是什么'});assert.match(answer,/纳齐森科鲁兹/);assert.match(answer,/质疑/);assert.equal(app.store.messages(old.session.id).length,2);
 const rows=app.store.records(1900000001);assert.equal(rows.length,4);const e=await fetch(app.origin+'/api/evidence/'+rows[0].id+'?sessionId='+fresh.session.id,{headers});assert.equal(e.status,200);const data=await e.json();assert.ok(data.quote.includes('卡特皮拉'));assert.equal(data.source.title,'藻海的寻踪');
 const denied=await fetch(app.origin+'/api/evidence/'+rows[0].id+'?sessionId='+old.session.id,{headers});assert.equal(denied.status,404);
 const follow=await call('/api/chat',{sessionId:fresh.session.id,question:'继续详细讲讲'});assert.match(follow,/ontology-leader-of/);
 const unrelated=await call('/api/chat',{sessionId:fresh.session.id,question:'愚人众是什么'});assert.doesNotMatch(unrelated,/ontology-leader-of/);
 const msg=buildMessages('水仙十字结社是什么',{records:rows,context:{}},[],'normal');assert.match(msg[1].content,/sourceText/);assert.match(msg[1].content,/卡特皮拉的陈述/);
});
