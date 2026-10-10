import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {retrieveOntology} from './ontology-pilot.mjs';
export const ontologyStage=1900000001;
export const openOntology='开放水仙十字结社专题（含后续剧情）';
export function installOntology(root,pack,corpus){
 const graph=JSON.parse(readFileSync(join(root,'data/ontology-pilot.json'))),pages=JSON.parse(readFileSync(join(root,'data/corpus/pages.json'))).pages;
 const suggestions=['水仙十字结社是什么','水仙十字结社的领袖是谁','水仙十字结社的目的是什么','水仙十字结社有哪些核心成员'];
 pack.stages.push({id:ontologyStage,title:'水仙十字结社 · 名词讲解试点',subtitle:'世界观专题 · 枫丹',region:'枫丹',category:'世界观专题',contentType:'summary',scopeMode:'independent',sourceId:'corpus-source-122821',summary:'开放《藻海的寻踪》《最后的问题》中选定的组织介绍证据，包含领袖、成员与后续剧情。当前仅试点本主题。',suggestions});
 const row=r=>({id:'ontology-'+r.id+'-'+r.evidence.textHash.slice(0,12),stage:ontologyStage,topic:'水仙十字结社 · '+r.predicate,section:r.evidence.path.join(' / '),task:r.evidence.title,text:r.claim,quote:pages.find(p=>p.pageid===r.evidence.pageid).sections[r.evidence.index].text,attribution:r.attribution,ontologyEvidence:true,contentType:'summary',sourceId:'corpus-source-'+r.evidence.pageid,entities:[],keywords:['水仙十字结社',r.predicate]});
 const get=q=>retrieveOntology(q,{allowedPageIds:[122821,110431]},graph,pages);
 const original=corpus.records.bind(corpus);corpus.records=progress=>progress===ontologyStage?get('水仙十字结社是什么').relations.map(row):original(progress);
 return(question,session)=>{
  if(session.progress!==ontologyStage){if(!question.includes('水仙十字结社'))return null;return{status:'scope',records:[],message:'已找到水仙十字结社的介绍证据。当前会话尚未开放本专题；点击下方按钮将新建专题对话，包含枫丹相关后续剧情，原对话保留。',followups:[openOntology]};}
  const q=/^(继续|再详细|详细|再讲|简短)/.test(question)?session.context?.ontologyQuestion??'水仙十字结社是什么':question;
  const result=get(q);if(result.status!=='answer')return{status:'missing',records:[],message:result.message??'本试点暂未整理这个问题的关系证据。',followups:suggestions};
  const records=result.relations.map(row);return{status:'answer',records,contentType:'summary',scopeId:ontologyStage,context:{topic:'水仙十字结社',recordIds:records.map(r=>r.id),entities:[],ontologyQuestion:q},followups:suggestions.filter(s=>s!==q)};
 };
}
