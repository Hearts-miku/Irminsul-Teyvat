import {applyDecisions,decisionResolver} from './ontology-decisions.mjs';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {normalizeName,fingerprint,nameMatcher,classifyIntent} from './ontology-index.mjs';
import {loadReviewed} from './ontology-reviewed.mjs';
import {tokens} from './retrieval.mjs';
const cache=new Map();
export function installFullOntology(root,pack,corpus){
 const file=join(root,'data/ontology/index.json'),stamp=statSync(file).mtimeMs;
 let g=cache.get(file);if(g?.stamp!==stamp){g={...JSON.parse(readFileSync(file)),stamp};cache.set(file,g);}
 const reviews=loadReviewed(root,corpus.pages);const reviewedNodes=new Map(reviews.entities.flatMap(e=>e.nodeIds.map(id=>[id,e])));
 g={...g,nodes:g.nodes.map(n=>{const e=reviewedNodes.get(n.id);return e?{...n,name:e.name,type:e.type,aliases:[...new Set([...n.aliases,...e.aliases])],reviewStatus:'source-reviewed',canonicalNodeId:e.primaryNodeId,reviewNote:e.scopeNote}:n;})};
 g=applyDecisions(g,reviews.decisions);
 g.summary={...g.summary,reviewedDecisions:reviews.decisions.length,reviewedEntities:reviews.entities.length,reviewedRelations:reviews.relations.length};
 const pages=new Map(corpus.pages.map(p=>[p.pageid,p])),snapshots=new Map(g.pages.map(p=>[p.pageid,p]));
 const nodes=new Map(g.nodes.map(n=>[n.id,n])),byStage=new Map(g.nodes.map(n=>[n.stageId,n]));
 const aliases=new Map();for(const n of g.nodes.filter(n=>!n.excluded))for(const a of n.aliases){const ids=aliases.get(a)??[];ids.push(n.id);aliases.set(a,ids);}
 // Dialogue headings such as “谁?” remain browsable, but are not entity mentions.
 const match=nameMatcher([...aliases].filter(([a])=>!/^(?:谁|什么|为什么|怎么|哪里|何处)[?？。！!]*$/.test(a))),validMemo=new Map();
 function valid(index){if(validMemo.has(index))return validMemo.get(index);const e=g.evidence[index],p=pages.get(e.pageid),old=snapshots.get(e.pageid),s=p?.sections[e.index];const ok=p&&old&&p.revision===old.revision&&p.sha256===old.sha256&&s&&fingerprint(s)===e.hash;validMemo.set(index,!!ok);return !!ok;}
 function row(index,stage){const e=g.evidence[index],p=pages.get(e.pageid),s=p.sections[e.index];return{id:`ontology-full-${e.pageid}-${e.index}-${e.hash.slice(0,12)}`,stage,topic:p.title+' · '+(s.path.at(-1)??'正文'),section:s.path.join(' / '),task:p.title,text:(s.path.length?'【'+s.path.join(' / ')+'】\n':'')+s.text,sourceId:'corpus-source-'+p.pageid,contentType:'source',entities:[],keywords:[p.title,...s.path],ontologyEvidenceIndex:index};}
 const entitySuggestions=n=>[`${n.name}是什么？`,`${n.name}有哪些经历？`,`${n.name}与谁有关？`];
 for(const n of g.nodes)if(n.evidence.length||n.isDisambiguation||n.excluded){const e=g.evidence[n.evidence[0]]??reviews.decisions.find(d=>d.id===n.decisionId).evidence;pack.stages.push({id:n.stageId,title:n.name+' · '+n.type,subtitle:'实体关联资料',category:'本体索引',kind:n.type,region:'跨来源',scopeMode:'independent',contentType:'source',isOntology:true,entityId:n.id,sourceId:'corpus-source-'+e.pageid,summary:'开放此名称的关联原文，可能包含后续剧情、人物观点和互斥条件。自动索引与字段关系尚未逐条核对；同名、别名仍可能需消歧。',suggestions:entitySuggestions(n)});}
 const original=corpus.records.bind(corpus);
 const evidenceCache=new Map();
 function entityRecords(n){if(!evidenceCache.has(n.id)){const ids=new Set(n.evidence.filter(valid));
  // Context is expanded only inside the same source path, not across choices.
  for(const i of [...ids])for(const j of [i-1,i+1]){const e=g.evidence[i],other=g.evidence[j];if(!other||other.pageid!==e.pageid||Math.abs(other.index-e.index)!==1||!valid(j))continue;const p=pages.get(e.pageid);if(JSON.stringify(p.sections[e.index].path)===JSON.stringify(p.sections[other.index].path))ids.add(j);}
  evidenceCache.set(n.id,[...ids]);}
  return evidenceCache.get(n.id).map(i=>row(i,n.stageId));
 }
 corpus.records=progress=>byStage.has(progress)?entityRecords(byStage.get(progress)):original(progress);
 const relationsByNode=new Map();for(const r of g.relations)for(const id of [r.subject,r.object]){const list=relationsByNode.get(id)??[];list.push(r);relationsByNode.set(id,list);}
 function scopeChoices(list,q){return list.filter(n=>n.evidence.some(valid)).slice(0,8).map(n=>({stageId:n.stageId,label:`开放「${n.name}」· ${n.type}（含后续剧情）`,question:q}));}
 function locate(q){q=normalizeName(q);const matched=[...new Map(match(q).map(id=>nodes.get(id)).map(n=>{const canonical=nodes.get(n.canonicalNodeId)??n;return[canonical.id,canonical];})).values()];const length=n=>Math.max(...n.aliases.filter(a=>q.includes(a)).map(a=>a.length));const longest=Math.max(...matched.map(length));return matched.filter(n=>length(n)===longest||!matched.some(o=>length(o)>length(n)&&o.aliases.some(a=>q.includes(a)&&n.aliases.some(b=>q.includes(b)&&a.includes(b)))));}
 const resolveDecision=decisionResolver({decisions:reviews.decisions,nodes,byStage,valid,row,graph:g});
 function retrieve(q,session,base,records){
  const decision=resolveDecision(q,session);if(decision)return decision;
  const current=byStage.get(session.progress),follow=/^(继续|再详细|详细|再讲|简短|它|他|她|这个组织|这个人)/.test(q);
  const intent=(follow&&/^(继续|再详细|详细|再讲|简短)/.test(q)?session.context?.ontologyIntent:null)??classifyIntent(q)??(follow&&session.context?.ontologyEntityIds?'definition':null);
  if(!intent)return current?{status:'missing',records:[],message:'请指出要了解的定义、人物关系、所属、地点或经历。效果数值仍在资料图鉴中。',followups:entitySuggestions(current)}:null;
  if(!current&&['spoiler','reference'].includes(base.status))return null;
  let found=locate(q);if(!found.length&&follow&&session.context?.ontologyEntityIds)found=session.context.ontologyEntityIds.map(id=>nodes.get(id)).filter(Boolean);if(!found.length&&current){if(!follow&&!/^(介绍一下|介绍|讲讲|有哪些经历|有哪些成员|在哪里)[？?。！!]*$/.test(q))return{status:'missing',records:[],message:'没有识别到这个问题的实体，请使用资料中的完整名称，或从推荐问题继续。',followups:entitySuggestions(current)};found=[current];}if(!found.length)return null;
  if(!current&&base.status==='answer'&&(base.contentType!=='source'||base.records?.some(r=>r.linkedSource)))return{...base,scopeSuggestions:scopeChoices(found,q)};
  if(current)found=found.filter(n=>(n.canonicalNodeId??n.id)===(current.canonicalNodeId??current.id)||!current.aliases.includes(n.name));
  if(current&&found.length&&!found.some(n=>(n.canonicalNodeId??n.id)===(current.canonicalNodeId??current.id)))return{status:'scope',records:[],message:'这个问题涉及另一对象，请选择关联专题新建对话。',scopeSuggestions:scopeChoices(found,q),followups:[]};
  const ambiguous=found.some(n=>found.some(o=>o.id!==n.id&&o.aliases.some(a=>q.includes(a)&&n.aliases.includes(a))));
  if(ambiguous&&!current)return{status:'clarify',records:[],message:'这个名称对应不同类型，请选择你指的对象；开放后将新建对话，原会话保留。',scopeSuggestions:scopeChoices(found,q),followups:[]};
  const selected=current?[current]:found;
  const allowed=new Set(records.map(r=>r.id));
  const candidates=new Map();
  for(const n of selected)for(const i of n.evidence){if(!valid(i))continue;const e=g.evidence[i];if(current){if(n.id!==current.id)continue;}else if(!allowed.has(e.recordId))continue;candidates.set(i,row(i,session.progress));}
  if(!candidates.size&&!current&&base.status==='answer')return{...base,scopeSuggestions:scopeChoices(selected,q)};
  if(!candidates.size)return{status:'scope',records:[],message:'当前范围没有可用的关联证据。可选择下方实体专题，开放后将新建对话并保留原会话。',scopeSuggestions:scopeChoices(selected,q),followups:[]};
  const terms=tokens(q),relationPredicates={membership:['affiliation','participant'],location:['located-in','nationality','occurs-in'],relation:['affiliation','participant','part-of'],history:['part-of','participant']};
  const relationIds=new Set(selected.flatMap(n=>(relationsByNode.get(n.id)??[]).filter(r=>(relationPredicates[intent]??[]).includes(r.predicate)).map(r=>r.evidence)));
  const scored=[...candidates].map(([i,r])=>{const e=g.evidence[i],s=pages.get(e.pageid).sections[e.index],body=s.text;
   let score=terms.reduce((v,t)=>v+Number(body.includes(t))*1.5,0);
   if(relationIds.has(i))score+=24;
   if(intent==='definition')for(const n of selected)for(const alias of n.aliases){const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp(escaped+'[」』”]?\\s*(?:是(?!什么|谁|否|不是|我|你|他|她|它|在|从|被|怎么|许诺)|指的是|被称为|由.{0,16}(?:创立|建立)|负责)').test(body)){score+=18;if(new RegExp(escaped+'[」』”]?\\s*是(?:这|一种|一类|一个|一件|一枚|外置|由|用来)').test(body))score+=18;break;}}
   if(intent==='definition'&&/是|称为|叫做|指的是|负责|组织|创立|建立/.test(body))score+=5;
   if(intent==='purpose'&&/为了|目的|所以|因为|原因|希望|想要/.test(body))score+=5;
   if(intent==='location'&&/位于|坐落|位置|所在|地区/.test(s.path.join(' ')+body))score+=5;
   if(selected.some(n=>n.pageIds.includes(e.pageid))&&s.path.length===1&&/名称|称号|职业|所属|介绍|详细|描述/.test(s.path[0]))score+=6;
   if(body.length<35&&!relationIds.has(i))score-=8;if(body.length>100)score+=2;
   if(/来源提示|任务地点|任务流程|选项\d+$|场景说明/.test(s.path.at(-1)??''))score-=8;
   return{i,r,score};}).sort((a,b)=>b.score-a.score);
  const chosen=scored.filter(x=>x.score>=3).slice(0,4);
  if(!chosen.length&&!current&&base.status==='answer')return{...base,scopeSuggestions:scopeChoices(selected,q)};
  if(!chosen.length)return{status:'missing',records:[],message:'已定位这个名称，但当前范围的片段不足以解释这个问题。可开放关联专题查看更多来源。',scopeSuggestions:scopeChoices(selected,q),followups:[]};
  const result=new Map(chosen.map(x=>[x.i,x.r]));
  for(const {i} of chosen)for(const j of [i-1,i+1]){if(result.size>=6||!candidates.has(j))continue;const a=g.evidence[i],b=g.evidence[j];if(a.pageid!==b.pageid||Math.abs(a.index-b.index)!==1)continue;const p=pages.get(a.pageid);if(JSON.stringify(p.sections[a.index].path)===JSON.stringify(p.sections[b.index].path))result.set(j,candidates.get(j));}
  return{status:'answer',records:[...result.values()],contentType:'source',context:{topic:selected[0].name,recordIds:[...result.values()].map(r=>r.id),entities:[],ontologyEntityIds:selected.map(n=>n.id),ontologyIntent:intent},followups:entitySuggestions(selected[0]),scopeSuggestions:current?[]:scopeChoices(selected,q)};
 }
 const query=params=>{const q=normalizeName((params.get('q')??'').slice(0,100)),type=params.get('type')??'',page=Math.max(1,Math.min(10000,Math.floor(Number(params.get('page')))||1));const all=g.nodes.filter(n=>!n.excluded&&(!n.canonicalNodeId||n.canonicalNodeId===n.id)&&(!q||n.aliases.some(a=>a.includes(q)))&&(!type||n.type===type));all.sort((a,b)=>Number(b.name===q)-Number(a.name===q)||b.evidence.length-a.evidence.length);return{summary:g.summary,total:all.length,page,pageSize:30,types:[...new Set(g.nodes.map(n=>n.type))],items:all.slice((page-1)*30,page*30).map(n=>({id:n.id,name:n.name,type:n.type,stageId:n.stageId,status:n.status,reviewStatus:n.reviewStatus,reviewNote:n.reviewNote,isDisambiguation:n.isDisambiguation,ambiguous:n.canonicalNodeId?false:n.ambiguous,evidenceCount:n.evidence.length,relationCount:relationsByNode.get(n.id)?.length??0}))};};
 function evidenceRecord(id,session,records){const match=/^ontology-full-(\d+)-(\d+)-([a-f0-9]+)$/.exec(id);if(!match)return null;const index=g.evidence.findIndex(e=>e.pageid===Number(match[1])&&e.index===Number(match[2])&&e.hash.startsWith(match[3]));if(index<0||!valid(index))return null;if(byStage.has(session.progress)){if(!entityRecords(byStage.get(session.progress)).some(r=>r.id===id))return null;}else if(!records.some(r=>r.id===g.evidence[index].recordId))return null;return row(index,session.progress);}
 return{retrieve,resolveDecision,query,evidenceRecord,summary:g.summary};
}
