import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export function validReview(item,pages){
 const {reviewHash,...body}=item,e=item.evidence,p=pages.get(e.pageid),s=p?.sections[e.index];
 return reviewHash===hash(body)&&p?.revision===e.revision&&p.sha256===e.sha256&&s&&hash(s.text)===e.textHash&&JSON.stringify(s.path)===JSON.stringify(e.path);
}
export function loadReviewed(root,pages){
 const graph=JSON.parse(readFileSync(join(root,'data/ontology/reviewed-ordo.json'))),byPage=new Map(pages.map(p=>[p.pageid,p]));
 return{...graph,entities:graph.entities.filter(e=>validReview(e,byPage)),relations:graph.relations.filter(r=>validReview(r,byPage))};
}
export function reviewedIntent(q){
 if(/水仙十字院/.test(q))return'institution';
 if(/诞生|身世|来源.*确定/.test(q))return'origin';
 if(/设计|制造/.test(q))return'designer';
 if(/编号|识别码|原型机/.test(q))return'identifier';
 if(/保护|陪伴|主人|职责/.test(q))return'protection';
 if(/诱饵|红鲱鱼|引开/.test(q))return'purpose-detail';
 if(/领袖|首领|领导/.test(q))return'leader';
 if(/成员|属于|所属|加入|效忠/.test(q))return'membership';
 if(/追捕|逮捕|遭遇|曾经|经历|历史|见过|相识/.test(q))return'history';
 if(/末日|预测|确定|真的|证伪|质疑/.test(q)&&!/目的|目标|想做/.test(q))return'prediction';
 if(/目的|目标|为什么|想做/.test(q))return'purpose';
 if(/关系|关联|有关/.test(q))return'relation';
 if(/是谁|是什么|什么组织|介绍|讲讲|来头|了解/.test(q))return'definition';
 return null;
}
export function matchReviewed(q,entities){
 return entities.filter(e=>e.aliases.some(a=>a.length>1?q.includes(a):new RegExp('(?:^|和|与|及|、|·)'+a+'(?:是|的|与|和|如何|为什么|曾|认|有|？|\\?|$)').test(q)));
}
export function installReviewedOntology(root,pack,corpus){
 const graph=loadReviewed(root,corpus.pages),pages=new Map(corpus.pages.map(p=>[p.pageid,p]));
 const all=JSON.parse(readFileSync(join(root,'data/ontology/reviewed-ordo.json')));
 const original=corpus.records.bind(corpus),legacy=1900000001;
 const row=(r,stage)=>({id:'reviewed-'+r.id+'-'+r.reviewHash.slice(0,12),stage,topic:graph.entities.find(e=>e.id===r.subject)?.name+' · '+r.predicate,task:r.evidence.title,section:r.evidence.path.join(' / '),text:r.claim,quote:pages.get(r.evidence.pageid).sections[r.evidence.index].text,attribution:r.attribution,ontologyEvidence:true,contentType:'summary',sourceId:'corpus-source-'+r.evidence.pageid,reviewedRelationId:r.id,entities:[],keywords:[r.predicate],semanticReview:{status:'source-reviewed',checkedAt:r.checkedAt,note:'仅本条关系按固定片段核对；人物观点、推测及条件见正文。'}});
 corpus.records=progress=>{const raw=original(progress);if(!raw)return raw;const allowed=new Set(raw.map(r=>r.id));return [...raw,...graph.relations.filter(r=>progress===legacy?[122821,110431].includes(r.evidence.pageid):allowed.has(r.evidence.recordId)||allowed.has(r.evidence.fullRecordId)).map(r=>row(r,progress))];};
 function choices(entities,q){return entities.flatMap(e=>{const stage=pack.stages.find(s=>s.entityId===e.primaryNodeId);return stage?[{stageId:stage.id,label:`开放「${e.name}」· ${e.type}（含后续剧情）`,question:q}]:[];});}
 function retrieve(question,session,records){
  if(/^水仙十字(?:是什么|是谁|[？?]?$)/.test(question))return{status:'clarify',records:[],message:'水仙十字可能指不同机构、事物或故事，请使用完整名称。',followups:[]};
  const follow=/^(继续|再详细|详细|再讲|简短|它|他|她|这个组织|这个人)/.test(question);
  let q=question;if(follow&&session.context?.reviewedQuestion){q=/^(继续|再详细|详细|再讲|简短)/.test(question)?session.context.reviewedQuestion:question+' '+(session.context.reviewedNames??[]).join(' ');}
  const found=matchReviewed(q,graph.entities);if(!found.length)return null;
  if(/「玛丽安」|安眠处.*玛丽安|安[与和]玛丽安|玛丽安[与和]安/.test(q)||(/水仙十字结社/.test(q)&&/水仙十字院/.test(q)))return{status:'clarify',records:[],message:'这些名称涉及不同场景或机构，当前核对证据不支持直接合并身份。请明确要讨论的对象与剧情阶段。',followups:[]};
  if(/哪一年|成立时间|生日|年龄|逐字全文|全部台词|已经被捕|肯定被捕/.test(q))return{status:'missing',records:[],message:'本批核对证据没有确认这个具体信息，不能用相关提及代替答案。',followups:[]};
  const intent=reviewedIntent(q);if(!intent)return null;
  const ids=new Set(found.map(e=>e.id));
  const relevant=r=>(ids.has(r.subject)||ids.has(r.object))&&r.intents.includes(intent)&&(!/核心成员/.test(q)||/核心/.test(r.predicate))&&(ids.size<2||[...ids].every(id=>id===r.subject||id===r.object));
  const expected=all.relations.filter(relevant),candidates=graph.relations.filter(relevant);
  if(!expected.length)return null;
  const allowed=new Map(records.filter(r=>r.reviewedRelationId).map(r=>[r.reviewedRelationId,r]));
  const available=candidates.filter(r=>allowed.has(r.id));
  if(!available.length){if(!candidates.length)return{status:'missing',records:[],message:'相关核对记录已失效，需重新核对来源后才能使用。',followups:[]};
   if(q.includes('水仙十字结社')&&session.progress!==legacy)return null;
   return{status:'scope',records:[],message:'已定位相关对象，但当前范围没有开放对应证据。开放专题会新建对话并保留原会话。',scopeSuggestions:choices(found,question),followups:[]};
  }
  const selected=available.slice(0,6),result=selected.map(r=>allowed.get(r.id));
  return{status:'answer',contentType:'summary',records:result,partial:available.length<expected.length,context:{topic:found.map(e=>e.name).join('、'),entities:[],recordIds:result.map(r=>r.id),reviewedQuestion:q,reviewedNames:found.map(e=>e.name)},followups:['继续详细讲讲'],scopeSuggestions:available.length<expected.length?choices(found,question):[]};
 }
 return{retrieve,graph};
}
