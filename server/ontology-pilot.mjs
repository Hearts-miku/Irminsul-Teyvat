import {createHash} from 'node:crypto';
const hash=text=>createHash('sha256').update(text).digest('hex');
// Opt-in experiment. This module does not change the production chat route.
export function retrieveOntology(question,{allowedPageIds=[]}={},graph,pages){
 const matched=graph.entities.filter(e=>e.aliases.some(a=>question.includes(a)));
 if(!matched.length)return {status:/水仙十字/.test(question)?'clarify':'unmatched',message:/水仙十字/.test(question)?'请明确是水仙十字结社，还是其他同名机构或事物。':'试验索引未覆盖此名词。',relations:[],evidence:[]};
 const intent=/领袖|领导|首领/.test(question)?'leader':/成员|雅各布/.test(question)?'member':/目的|目标|想做|为什么/.test(question)?'purpose':/末日|世界式|确定|真的/.test(question)?'prediction':/是什么|什么组织|介绍|讲讲|什么来头|了解/.test(question)?'definition':null;
 if(!intent)return{status:'unsupported',message:'试验仅支持定义、领袖、成员、目的及末日理论问题。',relations:[],evidence:[]};
 const ids=new Set(matched.map(e=>e.id));
 const candidates=graph.relations.filter(r=>(ids.has(r.subject)||ids.has(r.object))&&r.intents.includes(intent));
 const valid=candidates.filter(r=>{const e=r.evidence,p=pages.find(p=>p.pageid===e.pageid),s=p?.sections[e.index];return p?.revision===e.revision&&p.sha256===e.sha256&&s&&hash(s.text)===e.textHash&&JSON.stringify(s.path)===JSON.stringify(e.path);});
 const available=valid.filter(r=>allowedPageIds.includes(r.evidence.pageid));
 const suggestedSources=[...new Map(valid.filter(r=>!allowedPageIds.includes(r.evidence.pageid)).map(r=>[r.evidence.pageid,{pageid:r.evidence.pageid,title:r.evidence.title}])).values()];
 if(!available.length)return{status:valid.length?'scope-required':candidates.length?'stale':'missing',message:valid.length?'已定位相关资料，请主动开放相应剧情范围后查看。':'没有有效证据，不能据此回答。',suggestedSources,relations:[],evidence:[]};
 const evidence=[...new Map(available.map(r=>{const e=r.evidence;return[e.pageid+':'+e.index,{...e,text:pages.find(p=>p.pageid===e.pageid).sections[e.index].text}];})).values()];
 return{status:'answer',intent,partial:available.length!==candidates.length,relations:available,evidence,suggestedSources,answer:available.map(r=>r.claim).join('\n')};
}
