import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeName,fingerprint,nameMatcher} from '../server/ontology-index.mjs';
const corpus=JSON.parse(readFileSync('data/corpus/pages.json')),candidates=JSON.parse(readFileSync('test-results/ontology-candidates.json'));
const digest=s=>createHash('sha256').update(s).digest('hex');
const nodes=[],byName=new Map(),decisions=[];
const generic=/^(一个|一些|一种|一切|一定|一起|一直|一位|应该|可以|可能|如果|但是|所以|因为|已经|还是|只是|只有|还有|如何|怎么|为什么|这样|那样|如此|这些|那些|我们|你们|他们|她们|它们|自己|大家|什么|这个|那个|这里|那里|东西|事情|现在|过去|未来|今天|明天|昨天|曾经|真的|不是|没有|没什么|当然|很好|知道|发现|开始|结束|继续|完成|选择|选项|任务|对话|剧情|未知|无|是|否|未标注|待补充|来源提示|其他|全部|内容)$/;
const add=(name,type,status)=>{name=normalizeName(name);const existing=byName.get(name)??[];let n=existing.find(n=>n.type===type);if(n)return n;
 const id=digest(name+'\0'+type).slice(0,20);n={id,name,type,status,aliases:[name],pageIds:[],evidence:[]};nodes.push(n);existing.push(n);byName.set(name,existing);return n;};
for(const e of candidates.entries){
 const reason=generic.test(e.name)||!/[\p{L}]/u.test(e.name)||/[【】〔〕=\n{}<>]/.test(e.name)?'通用词或解析标记':null;
 if(reason){decisions.push({name:e.name,status:'excluded',reason});continue;}
 const types=e.types.filter(t=>t!=='对白说话者');if(!types.length)types.push(e.types.includes('对白说话者')?'说话者（待消歧）':'名词（待分类）');
 const ids=types.map(type=>add(e.name,type,e.tier==='明确字段候选'?'source-field':'candidate').id);
 decisions.push({name:e.name,status:types.length>1?'split-types':'indexed',entityIds:ids});
}
const pageNode=new Map();
for(const p of corpus.pages){const type=['NPC','角色故事','角色对话'].includes(p.kind)?'人物':'任务与事件';const name=p.kind==='角色对话'?p.title.replace(/\/幻想真境剧诗$/,''):p.title;
 const n=add(name,type,'source-page');n.status='source-page';n.pageIds.push(p.pageid);pageNode.set(p.pageid,n);
 for(const alias of p.names??[]){const key=normalizeName(alias);if(key.length<2||generic.test(key))continue;if(!n.aliases.includes(key))n.aliases.push(key);}
}
// Only confirmed redirect metadata supplies extra aliases; no identity guesses.
for(const a of JSON.parse(readFileSync('data/corpus-title-aliases.json'))){for(const n of byName.get(normalizeName(a.to))??[])if(!n.aliases.includes(normalizeName(a.from)))n.aliases.push(normalizeName(a.from));}
const aliases=new Map();for(const n of nodes)for(const a of n.aliases){const ids=aliases.get(a)??new Set();ids.add(n.id);aliases.set(a,ids);}
const match=nameMatcher([...aliases].map(([a,ids])=>[a,[...ids]])),byId=new Map(nodes.map(n=>[n.id,n])),evidence=[],relations=[];
const predicates={'所属组织':['affiliation','组织或族群'],'所属国家':['nationality','地点'],'所在国家':['located-in','地点'],'任务地区':['occurs-in','地点'],'位置':['located-in','地点'],'系列任务':['part-of','任务与事件'],'出场人物':['participant','人物']};
for(const p of corpus.pages){
 const occurrences=new Map();
 for(const [index,s] of p.sections.entries()){
  const keyHash=digest(JSON.stringify([s.path,s.text,...(s.origin?[s.origin]:[])])).slice(0,16),occurrence=occurrences.get(keyHash)??0;occurrences.set(keyHash,occurrence+1);
  if(s.origin)continue; // Source evidence is indexed once, never by copied contexts.
  const ids=new Set(match(s.text));
  const owner=pageNode.get(p.pageid);ids.add(owner.id);
  const key=s.path.length===1?s.path[0]:null,rule=predicates[key];
  if(!ids.size)continue;
  const id=evidence.length;evidence.push({pageid:p.pageid,index,hash:fingerprint(s),recordId:`corpus-${p.pageid}-${p.revision}-${keyHash}-${occurrence}`});
  for(const entityId of ids)byId.get(entityId).evidence.push(id);
  if(rule){for(const value of s.text.split(/[、,，\n]/)){const options=byName.get(normalizeName(value))??[];const target=options.find(n=>n.type===rule[1]);if(target&&target.id!==owner.id)relations.push({subject:owner.id,predicate:rule[0],object:target.id,evidence:id,status:'source-field',attribution:'来源页面字段；未逐条人工核对'});}}
 }
}
for(const n of nodes){const proposed=1300000000+parseInt(digest(n.id).slice(0,7),16);n.stageId=proposed;n.ambiguous=n.aliases.some(a=>(aliases.get(a)?.size??0)>1);}
const stages=new Set();for(const n of nodes){if(stages.has(n.stageId))throw Error('实体范围 ID 冲突：'+n.name);stages.add(n.stageId);}
const pages=corpus.pages.map(p=>({pageid:p.pageid,revision:p.revision,sha256:p.sha256}));
const summary={sourcePages:pages.length,candidateNames:candidates.entries.length,indexedCandidateNames:decisions.filter(d=>d.status!=='excluded').length,excludedNames:decisions.filter(d=>d.status==='excluded').length,entities:nodes.length,entitiesWithEvidence:nodes.filter(n=>n.evidence.length).length,evidenceFragments:evidence.length,fieldRelations:relations.length,ambiguousAliases:[...aliases.values()].filter(v=>v.size>1).length,splitNames:decisions.filter(d=>d.status==='split-types').length,byType:nodes.reduce((a,n)=>(a[n.type]=(a[n.type]??0)+1,a),{}),semanticReviewComplete:false};
mkdirSync('data/ontology',{recursive:true});
writeFileSync('data/ontology/index.json',JSON.stringify({schemaVersion:1,builtAt:new Date().toISOString(),summary,pages,nodes,evidence,relations}));
writeFileSync('data/ontology/decisions.json',JSON.stringify({summary,decisions},null,2));
writeFileSync('test-results/ontology-decisions.json',JSON.stringify({summary,decisions},null,2));
console.log(JSON.stringify(summary,null,2));
