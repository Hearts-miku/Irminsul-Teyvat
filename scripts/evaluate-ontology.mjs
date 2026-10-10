import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const read=p=>JSON.parse(readFileSync(p)),suite=read('data/ontology/acceptance.json');
const args=process.argv.slice(2),baseline=args.includes('--baseline-root'),root=baseline?resolve(args[args.indexOf('--baseline-root')+1]):process.cwd();
const {createApp}=await import(pathToFileURL(join(root,'server/app.mjs')));
const index=read('data/ontology/index.json'),reviews=read('data/ontology/reviewed-ordo.json');
mkdirSync('test-results',{recursive:true});
const app=await createApp({root,dataDir:mkdtempSync(resolve('test-results/ontology-eval-'))});
const headers={'X-App-Token':app.token,'Content-Type':'application/json'},results=[];
try{
 for(const c of suite.cases){
  const entity=reviews.entities.find(e=>e.id===c.entity),node=index.nodes.find(n=>n.id===entity?.primaryNodeId);
  const progress=c.scope==='locked'?1:node.stageId;
  const session=app.store.createSession(progress);
  const ask=async question=>{const r=await fetch(app.origin+'/api/chat',{method:'POST',headers,body:JSON.stringify({sessionId:session.id,question})});if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();if(text.includes('"type":"error"'))throw Error(text);return app.store.messages(session.id).at(-1);};
  const start=performance.now();let error;let message;
  try{if(c.primer)await ask(c.primer);message=await ask(c.question);}catch(e){error=e.message;}
  const citations=message?.citations??[],text=(message?.sections??[]).map(s=>s.text).join('\n'),failures=[];
  if(error)failures.push('request-error');
  if(!(c.expected.statuses??['answer']).includes(message?.status))failures.push('status');
  if(c.expected.noEvidence&&citations.length)failures.push('scope-leak');
  if(c.expected.relation){const relation=reviews.relations.find(r=>r.id===c.expected.relation),e=relation.evidence;const found=citations.some(r=>r.reviewedRelationId===relation.id||[e.recordId,e.fullRecordId,'ontology-'+relation.id+'-'+e.textHash.slice(0,12)].includes(r.id));if(!found)failures.push('expected-evidence-not-cited');}
  for(const term of c.expected.includes??[])if(!text.includes(term))failures.push('missing-text:'+term);
  if(c.expected.qualifier&&!new RegExp(c.expected.qualifier).test(text))failures.push('missing-qualification');
  for(const citation of citations){const r=await fetch(app.origin+'/api/evidence/'+citation.id+'?sessionId='+session.id,{headers});if(!r.ok)failures.push('citation-unreadable');}
  results.push({id:c.id,question:c.question,scope:c.scope,status:message?.status,passed:!failures.length,failures,reviewedCitationCount:citations.filter(r=>r.reviewedRelationId).length,citationIds:citations.map(r=>r.id),durationMs:Math.round(performance.now()-start),...(error?{error}:{} )});
 }
}finally{await app.close();}
const report={baseline,scope:suite.scope,cases:results.length,uniqueQuestions:new Set(suite.cases.map(c=>c.question)).size,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,scopeLeaks:results.filter(r=>r.failures.includes('scope-leak')).length,results};
writeFileSync('test-results/ontology-acceptance'+(baseline?'-baseline':'')+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:results.filter(r=>!r.passed).map(({id,question,status,failures})=>({id,question,status,failures}))},null,2));
if(report.failed&&!baseline)process.exitCode=1;
