import {normalizeName} from './ontology-index.mjs';

export function applyDecisions(graph,decisions){
 const byNode=new Map(decisions.flatMap(d=>d.nodeIds.map(id=>[id,d])));
 return {...graph,nodes:graph.nodes.map(n=>{
  const d=byNode.get(n.id);if(!d)return n;
  const common={...n,decisionId:d.id,decisionAction:d.action,reviewStatus:'decision-reviewed',reviewNote:d.reason};
  if(d.action==='exclude')return {...common,excluded:true,evidence:[]};
  if(d.action==='disambiguate')return {...common,type:d.type,evidence:[],isDisambiguation:true};
  const v=d.variants.find(v=>v.nodeId===n.id);
  return {...common,name:v.name,type:v.type,aliases:[...new Set([...n.aliases,...v.aliases.map(normalizeName)])],pageIds:v.pageIds,evidence:n.evidence.filter(i=>v.pageIds.includes(graph.evidence[i].pageid)),ambiguous:true};
 })};
}

export function decisionResolver({decisions,nodes,byStage,valid,row,graph}){
 const byId=new Map(decisions.map(d=>[d.id,d]));
 const suggestions=ids=>ids.map(id=>nodes.get(id)).filter(n=>n&&!n.excluded&&(n.isDisambiguation||n.evidence.some(valid))).map(n=>({stageId:n.stageId,label:`开放「${n.name}」· ${n.type}（含后续剧情）`,question:n.name+'是什么？'}));
 return (question,session)=>{
  const q=normalizeName(question),current=byStage.get(session.progress);
  const general=decisions.find(d=>d.action==='disambiguate');
  const specific=general?.targetNodeIds.some(id=>nodes.get(id)?.aliases.some(a=>q.includes(a)));
  if(general&&((q.includes(general.name)&&!specific)||(current?.isDisambiguation&&/^(继续|再详细|再讲|介绍|讲讲|它)/.test(q)&&!specific)))return{status:'clarify',records:[],message:'“水仙十字”可指不同机构、故事或任务，请先选择具体对象；选择后会新建对话，原对话保留。',scopeSuggestions:suggestions(general.targetNodeIds),followups:[]};
  if(current?.excluded){const d=byId.get(current.decisionId);return{status:'clarify',records:[],message:'这个旧入口是从对白中误提取的整句，已停止作为实体讲解。原对话与已引用原文仍保留，请选择具体对象。',scopeSuggestions:suggestions(d.targetNodeIds),followups:[]};}
  const split=decisions.find(d=>d.action==='distinguish'&&(q.includes(d.alias)||(d.nodeIds.includes(current?.id)&&/^(继续|再详细|再讲|简短|介绍|讲讲|这个系列|这个任务|本系列|本任务|有哪些|有.*对白)/.test(q))));
  if(!split)return null;
  const explicit=split.variants.filter(v=>q.includes(v.type));
  const target=explicit.length===1?nodes.get(explicit[0].nodeId):explicit.length>1?null:split.nodeIds.includes(current?.id)?current:null;
  if(!target)return{status:'clarify',records:[],message:'此名称同时对应单个任务和系列任务，已分开核对，请选择要讨论的范围。',scopeSuggestions:suggestions(split.nodeIds),followups:[]};
  if(current?.id!==target.id)return{status:'scope',records:[],message:'已定位对应任务层级，请开放该范围后查看资料。',scopeSuggestions:suggestions([target.id]),followups:[]};
  const variant=split.variants.find(v=>v.nodeId===target.id);
  if(target.type==='系列任务'&&/对白|台词|剧情|发生|经历/.test(q))return{status:'missing',records:[],message:'这个系列条目只收录目录字段，没有独立对白正文。可以另行开放单个任务；不会自动借用子任务对白。',scopeSuggestions:suggestions(split.nodeIds.filter(id=>id!==target.id)),followups:[]};
  // Only definition/overview requests use metadata. Other questions keep ordinary retrieval.
  if(!/是什么|介绍|讲讲|概况|^(继续|再详细|再讲|简短)/.test(q))return null;
  const selected=target.evidence.filter(i=>valid(i)&&variant.definitionIndexes.includes(graph.evidence[i].index));
  if(!selected.length)return{status:'missing',records:[],message:'任务元数据证据已失效，需要重新核对。',followups:[]};
  return{status:'answer',records:selected.map(i=>row(i,session.progress)),contentType:'source',context:{topic:target.name,recordIds:selected.map(i=>row(i,session.progress).id),entities:[],ontologyEntityIds:[target.id],ontologyIntent:'definition'},followups:['继续详细讲讲']};
 };
}
