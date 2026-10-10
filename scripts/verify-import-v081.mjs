import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {loadCorpus} from '../server/corpus.mjs';
const root=resolve('.'),baseline=JSON.parse(readFileSync('test-results/import-baseline-v081.json')),data=JSON.parse(readFileSync('data/corpus/pages.json'));
const old=new Map(baseline.pages.map(p=>[p.pageid,p.revision])),added=data.pages.filter(p=>!old.has(p.pageid));
assert.ok(added.length);for(const p of data.pages.filter(p=>old.has(p.pageid)))assert.equal(p.revision,old.get(p.pageid));
const corpus=loadCorpus(root);for(const p of added){const raw=JSON.parse(readFileSync(`.cache/corpus/pages/${p.pageid}.json`));assert.equal(createHash('sha256').update(raw.wikitext).digest('hex'),p.sha256);const records=corpus.records(1000000000+p.pageid);assert.equal(records.length,p.sections.length);assert.ok(records.every(r=>r.stage===1000000000+p.pageid));}
const byCategory={};for(const p of added)for(const c of p.categories){(byCategory[c]??=[]).push(p.title);}
const samples=['食莲者','时与风','石锁机关秘话','阿圆','阿扎尔','美妙旅程','骑士修行之道'].map(title=>added.find(p=>p.title===title)).filter(Boolean);
mkdirSync('test-results',{recursive:true});const app=await createApp({root,dataDir:mkdtempSync(join(root,'test-results','import-check-'))});const headers={'X-App-Token':app.token,'Content-Type':'application/json'},checks=[];
try{for(const p of samples){const stage=1000000000+p.pageid;const listing=await(await fetch(`${app.origin}/api/corpus?q=${encodeURIComponent(p.title)}`,{headers})).json();assert.ok(listing.items.some(i=>i.pageid===p.pageid));const view=await(await fetch(app.origin+'/api/sessions',{method:'POST',headers,body:JSON.stringify({progress:stage})})).json();const response=await fetch(app.origin+'/api/chat',{method:'POST',headers,body:JSON.stringify({sessionId:view.session.id,question:'这页有哪些对话？'})});assert.equal(response.status,200);const events=(await response.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));const answer=events.find(e=>e.type==='done')?.message;assert.ok(answer?.citations?.length,p.title);for(const c of answer.citations){assert.equal(c.stage,stage);const r=await fetch(`${app.origin}/api/evidence/${c.id}?sessionId=${view.session.id}`,{headers});assert.equal(r.status,200);const ev=await r.json();assert.equal(ev.source.revision,String(p.revision));}checks.push({title:p.title,pageid:p.pageid,citations:answer.citations.length});}}
finally{await app.close();}
const report={passed:true,checkedAt:new Date().toISOString(),added:added.length,previous:baseline.report.importedPages,total:data.pages.length,fragments:data.report.fragments,remaining:data.report.missing.length,previousRevisionsUnchanged:true,newPagesValidated:added.length,categories:Object.fromEntries(Object.entries(byCategory).map(([k,v])=>[k,{count:v.length,examples:v.slice(0,8)}])),checks};writeFileSync('test-results/import-v081-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
