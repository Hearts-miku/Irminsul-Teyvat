import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {plainWiki} from './lib/corpus-text.mjs';
const corpus=JSON.parse(readFileSync('data/corpus/pages.json')),pilot=JSON.parse(readFileSync('data/ontology-pilot.json'));
const map=new Map(),rejected={};let sections=0,linkedCopiesSkipped=0,rawHashesChecked=0;
const normalize=s=>s.normalize('NFKC').replace(/^[\s「」『』《》“”]+|[\s「」『』《》“”]+$/g,'').replace(/\s+/g,' ').trim();
const ignore=/^(无|未知|未标注|是|否|暂无|待补充|其他|全部|内容|对话|任务|剧情|选项\d*|旁白|旅行者先生\/小姐)$/;
function add(value,type,method,p,locator){
 const name=normalize(plainWiki(value));
 if(method==='speaker'&&(/^(?:[0-9]+|[?？….\s]+)$/.test(name)||/[〔〕【】=]/.test(name)||/^(完成|未完成|任务|选项|接取|食谱|来源|提示|奖励|时间|地点|活动|攻略)/.test(name))){rejected[method]=(rejected[method]??0)+1;return;}
 if(name.length<2||name.length>45||ignore.test(name)||/[\n{}<>=%]|https?:|文件:|分类:|模板:|File:|Category:|Template:/i.test(name)){rejected[method]=(rejected[method]??0)+1;return;}
 let e=map.get(name);if(!e){e={name,types:new Set(),methods:new Set(),pages:new Set(),evidence:[]};map.set(name,e);}
 if(type)e.types.add(type);e.methods.add(method);e.pages.add(p.pageid);
 if(e.evidence.length<6&&!e.evidence.some(r=>r.pageid===p.pageid&&r.method===method))e.evidence.push({pageid:p.pageid,title:p.title,revision:p.revision,method,locator});
}
for(const p of corpus.pages){
 const raw=JSON.parse(readFileSync(`.cache/corpus/pages/${p.pageid}.json`));
 if(createHash('sha256').update(raw.wikitext).digest('hex')!==p.sha256)throw Error('来源校验失败 '+p.title);rawHashesChecked++;
 const person=p.kind==='NPC'||p.kind==='角色故事';
 add(p.title,person?'人物':p.kind==='角色对话'?'资料页面':'任务与事件','page-title',p,'页面标题');
 for(const name of p.characters??[])add(name,'人物','character-field',p,'出场人物');
 if(p.dedicatedCharacter)add(p.dedicatedCharacter,'人物','character-field',p,'专属角色');
 const text=raw.wikitext.replace(/<!--[\s\S]*?-->/g,'');
 for(const m of text.matchAll(/^\|(所属组织|任务地区|所在国家|所属国家|位置|系列任务)\s*=([^\n]*)/gm)){
  const type=m[1]==='所属组织'?'组织或族群':m[1]==='系列任务'?'任务与事件':'地点';
  for(const value of m[2].split(/[、,，]|<br\s*\/?>/i))add(value,type,'structured-field',p,m[1]);
 }
 for(const m of text.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g)){
  const name=m[1].split('#')[0];if(name)add(name,null,'wiki-link',p,'内部链接');
 }
 for(const s of p.sections){if(s.origin){linkedCopiesSkipped++;continue;}sections++;
  for(const known of pilot.entities)for(const alias of known.aliases)if(s.text.includes(alias))add(alias,known.type==='组织'?'组织或族群':known.type,'known-name',p,s.path.join(' / '));
  if(s.path.some(t=>/剧情|对话|内容/.test(t)))for(const m of s.text.matchAll(/(?:^|\n)[ \t*]*([^\n：:]{1,24})[：:]/g))add(m[1],'对白说话者','speaker',p,s.path.join(' / '));
  for(const m of s.text.matchAll(/[「『]([^「」『』\n]{2,24})[」』]/g))add(m[1],null,'quoted-term',p,s.path.join(' / '));
 }
}
const strong=new Set(['page-title','character-field','structured-field']);
const entries=[...map.values()].map(e=>{
 const pilotMatches=pilot.entities.filter(p=>[p.name,...p.aliases].some(a=>normalize(a)===e.name)).map(p=>p.id);
 const tier=[...e.methods].some(m=>strong.has(m))?'明确字段候选':e.methods.has('speaker')?'对白说话者候选':e.methods.has('wiki-link')?'内部链接候选':e.methods.has('quoted-term')?'引号名词候选':'正文已知名词候选';
 const classification=e.types.has('人物')?'人物':e.types.has('任务与事件')?'任务与事件':e.types.has('组织或族群')?'组织或族群':e.types.has('地点')?'地点':e.types.has('对白说话者')?'对白说话者':e.types.has('资料页面')?'资料页面':'未定类名词';
 return {...e,types:[...e.types],methods:[...e.methods],pages:[...e.pages],tier,classification,needsTypeReview:[...e.types].filter(t=>t!=='对白说话者').length>1,pilotMatches,status:pilotMatches.length?'试点已有实体（仍需扩展关系）':'待整理'};
}).sort((a,b)=>b.pages.length-a.pages.length||a.name.localeCompare(b.name,'zh-CN'));
const countBy=key=>entries.reduce((a,e)=>(a[e[key]]=(a[e[key]]??0)+1,a),{});
const summary={pages:corpus.pages.length,rawHashesChecked,originalSectionsScanned:sections,linkedCopiesSkipped,uniqueCandidateNames:entries.length,byTier:countBy('tier'),byPrimaryClassification:countBy('classification'),typeConflicts:entries.filter(e=>e.needsTypeReview).length,pilotCoveredNames:entries.filter(e=>e.pilotMatches.length).length,notYetInPilot:entries.filter(e=>!e.pilotMatches.length).length,rejected};
mkdirSync('test-results',{recursive:true});writeFileSync('test-results/ontology-candidates.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:'全量本地原文；规则提取候选，不是已经确认的实体总数',normalization:'仅统一字符宽度、外侧引号和空白；不自动合并别名，不拆解推测身份。相同名字暂聚合但保留所有页面，仍可能同名异人。',summary,entries},null,2)+'\n');
const table=obj=>Object.entries(obj).map(([k,v])=>`| ${k} | ${v} |`).join('\n');
writeFileSync('docs/ONTOLOGY-INVENTORY.md',`# 全库实体候选盘点\n\n日期：${new Date().toISOString().slice(0,10)}。扫描 ${summary.pages} 页，校验 ${rawHashesChecked} 个来源哈希，扫描 ${sections} 个原始解析片段，跳过 ${linkedCopiesSkipped} 个跨页引用副本。\n\n共 ${entries.length} 个去重名称候选，其中 ${summary.pilotCoveredNames} 个名称已在试点出现，${summary.notYetInPilot} 个尚未纳入试点。本统计不是已确认实体总数：别名尚未归并，同名实体尚未拆分，链接可能是物品或资料页面，引号可能是普通表达，说话者可能是匿名身份或场景文本。\n\n## 按证据层级（互斥）\n\n| 层级 | 名称数 |\n| --- | ---: |\n${table(summary.byTier)}\n\n## 初步主分类（互斥）\n\n| 主分类 | 名称数 |\n| --- | ---: |\n${table(summary.byPrimaryClassification)}\n\n主分类优先顺序只是统计规则；${summary.typeConflicts} 个名称出现多种明确类型，需要消歧。人物、组织/族群、地点、任务事件等均为候选。试点的 4 个实体只完成少量关系，不算全量整理完成。\n\n## 优先整理建议\n\n先核对明确字段中的人物与组织，再处理高频说话者、世界观名词；任务节点用于证据挂接。内部链接和引号名词应先过滤，不宜按候选数量直接估算人工工作量。\n\n完整清单：test-results/ontology-candidates.json。每个名称保存候选类型、提取方法、出现页 ID 集合和最多 6 个代表性来源定位（不是全部提及位置）。可用 node scripts/scan-ontology-candidates.mjs 重跑。未修改资料库或用户会话。\n`);
console.log(JSON.stringify(summary,null,2));
