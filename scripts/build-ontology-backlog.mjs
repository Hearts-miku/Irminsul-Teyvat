import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadReviewed} from '../server/ontology-reviewed.mjs';
const read=p=>JSON.parse(readFileSync(p)),g=read('data/ontology/index.json'),corpus=read('data/corpus/pages.json');
const reviewed=loadReviewed(process.cwd(),corpus.pages),gaps=read('data/source-gap-review.json');
const bound=new Map(reviewed.entities.flatMap(e=>e.nodeIds.map(id=>[id,e]))),byId=new Map(g.nodes.map(n=>[n.id,n]));
const digest=s=>createHash('sha256').update(s).digest('hex').slice(0,20),tasks=[];
const priority=n=>bound.has(n.id)||/水仙十字|世界式|纳齐森科鲁兹|吉约丹/.test(n.name)?'P0':/世界树|地脉|深渊|天理|降临者|原始胎海|厄里那斯|坎瑞亚|花灵/.test(n.name)?'P1':'P2';
for(const n of g.nodes){const facets=[];const review=bound.get(n.id);
 if(n.type==='名词（待分类）')facets.push({kind:'classification',status:review?'complete':'pending'});
 if(n.type==='说话者（待消歧）')facets.push({kind:'speaker-identity',status:review?'complete':'pending'});
 if(!n.evidence.length)facets.push({kind:'missing-evidence',status:'pending'});
 if(review&&!facets.length)facets.push({kind:'classification',status:'complete'});
 if(facets.length)tasks.push({id:'entity:'+n.id,kind:'entity',name:n.name,nodeIds:[n.id],priority:priority(n),status:facets.every(f=>f.status==='complete')?'complete':'pending',facets,reason:review?'分类／别名有固定片段核对记录；不代表全部经历核对完成':'候选提取结果尚不能确定实体性质或身份',evidenceCount:n.evidence.length,...(review?{reviewId:review.id}:{} )});
}
const aliases=new Map();for(const n of g.nodes)for(const a of n.aliases){const ids=aliases.get(a)??new Set();ids.add(n.id);aliases.set(a,ids);}
for(const [name,ids]of aliases)if(ids.size>1){const reviews=[...ids].map(id=>bound.get(id));const same=reviews.every(Boolean)&&new Set(reviews.map(r=>r.id)).size===1;tasks.push({id:'alias:'+digest(name),kind:'alias',name,nodeIds:[...ids],priority:[...ids].some(id=>priority(byId.get(id))==='P0')?'P0':'P2',status:same?'complete':'pending',reason:same?'固定对白确认简称与全名的指代；保留旧节点以兼容会话':'存在多对象映射，必须分别判断别名、同名异人或不同类型，不按名称强行合并'});}
for(const r of g.relations){const e=g.evidence[r.evidence];tasks.push({id:'field:'+digest(JSON.stringify([r.subject,r.predicate,r.object,r.evidence])),kind:'field-relation',subject:r.subject,predicate:r.predicate,object:r.object,source:{pageid:e.pageid,index:e.index},priority:bound.has(r.subject)||bound.has(r.object)?'P1':'P2',status:'pending',reason:'来源字段自动提取；尚未逐条确认语义、适用阶段及条件'});}
const sources=new Map();
for(const c of gaps.catalog){const key=c.title.normalize('NFKC');sources.set(key,{id:'source:'+digest(key),kind:'source-gap',name:c.title,priority:c.kind.startsWith('commission')?'P3':'P1',status:'pending',lastSourceCheck:gaps.checkedAt,facets:[{kind:'catalog-unlinked',catalogId:c.id,sourceStatus:c.status}],reason:c.reason});}
for(const p of gaps.sourceGaps){const key=p.title.normalize('NFKC'),task=sources.get(key)??{id:'source:'+digest(key),kind:'source-gap',name:p.title,priority:/预期内/.test(p.title)?'P1':'P2',status:'pending',lastSourceCheck:gaps.checkedAt,facets:[],reason:'缺失标记可能仅涉及图片或部分内容，先核实类型；不是整篇剧情缺失'};task.facets.push({kind:'source-marker',pageid:p.pageid,revision:p.revision});sources.set(key,task);}
tasks.push(...sources.values(),{id:'source:mitiya-story',kind:'source-gap',name:'米提亚',priority:'P2',status:'pending',lastSourceCheck:gaps.checkedAt,facets:[{kind:'empty-story-field'}],reason:'历史记录中的故事字段为空，尚未在线复核新修订'});
for(const r of reviewed.relations)tasks.push({id:'reviewed:'+r.id,kind:'reviewed-relation',priority:'P0',status:'complete',subject:r.subject,predicate:r.predicate,object:r.object,source:{pageid:r.evidence.pageid,index:r.evidence.index},reason:r.attribution});
const unique=new Map();for(const task of tasks){const old=unique.get(task.id);if(old){if(task.kind!=='field-relation')throw Error('待办 ID 冲突');old.occurrenceCount=(old.occurrenceCount??1)+1;}else unique.set(task.id,task);}tasks.splice(0,tasks.length,...unique.values());
const summary={taskCount:tasks.length,pending:tasks.filter(t=>t.status==='pending').length,complete:tasks.filter(t=>t.status==='complete').length,byKind:tasks.reduce((a,t)=>{const v=a[t.kind]??={pending:0,complete:0};v[t.status]++;return a;},{}),byPriority:tasks.filter(t=>t.status==='pending').reduce((a,t)=>(a[t.priority]=(a[t.priority]??0)+1,a),{}),reviewedEntities:reviewed.entities.length,reviewedRelations:reviewed.relations.length,sourceCheckDate:gaps.checkedAt};
writeFileSync('data/ontology/backlog.json',JSON.stringify({schemaVersion:1,scope:'当前本地索引；优先级是整理顺序，不是已确认的世界观关联结论。实体、别名、关系与来源任务单位不同，不能相加为实体数。',summary,tasks}));
writeFileSync('docs/CURRENT-WORK.md',`# 当前执行清单\n\n本文件由 npm run ontology:backlog 从当前数据生成。历史版本记录保留在 REVIEW-TASKS.md，不作为当前待办数量。\n\n| 类型 | 待处理 | 已完成 |\n| --- | ---: | ---: |\n${Object.entries(summary.byKind).map(([k,v])=>`| ${k} | ${v.pending} | ${v.complete} |`).join('\n')}\n\n本批核对 ${summary.reviewedEntities} 个逻辑实体、${summary.reviewedRelations} 条关系；分类与别名核对不等于整个实体的经历全部核对。两个人物名称节点可能映射同一逻辑实体。\n\nP0 优先处理首批水仙十字相关问题，P1 优先处理世界观关键词与相关来源缺口，P2 为其余分类、字段关系及原文标记，P3 为旧委托目录。关键词只用于排序，不证明世界观关联。当前待办优先级：${JSON.stringify(summary.byPriority)}。\n\n来源缺口的上次在线核查日期为 ${gaps.checkedAt}；本次没有宣称源站状态仍相同。30 页来源标记不等于 30 篇剧情全文缺失。\n\n机器清单：data/ontology/backlog.json。同一实体的分类、说话者和缺证据问题归入一个任务的 facets；同名来源缺口合并，关系按端点、谓词与证据定位保留。\n\n后续顺序：完成当前验收集与首批闭环 → 复核 P0 未解决名称 → 按主题扩展关系 → 在线复查高优先级来源 → 低优先级委托。效果图鉴继续占位。\n`);
console.log(JSON.stringify(summary,null,2));
