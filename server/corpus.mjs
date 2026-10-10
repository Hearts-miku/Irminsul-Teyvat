import {createHash} from 'node:crypto';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {chapterScopes,chapterPagesThrough} from './chapter-scopes.mjs';
const cache=new Map();
const stageId=id=>1000000000+id;
export function loadCorpus(root){
 const path=join(root,'data/corpus/pages.json');
 if(!existsSync(path))return {stages:[],sources:[],query:()=>({items:[],total:0,page:1,pageSize:30,kinds:[],report:{importedPages:0,indexedPages:0,pendingPages:0,dialoguePages:0,fragments:0,indexCapturedAt:null,completeGameCoverage:false}}),records:()=>null};
 const stamp=statSync(path).mtimeMs;let data=cache.get(path);
 if(!data||data.stamp!==stamp){data={...JSON.parse(readFileSync(path,'utf8')),stamp};cache.set(path,data);}
 const byStage=new Map(data.pages.map(p=>[stageId(p.pageid),p]));
 const catalogPath=join(root,'data/catalog/index-snapshot.json');
 const chapters=chapterScopes(data.pages,existsSync(catalogPath)?JSON.parse(readFileSync(catalogPath,'utf8')).items:[]);
 const chapterByStage=new Map(chapters.map(c=>[c.id,c]));
 const report={importedPages:data.report.importedPages,indexedPages:data.report.indexedPages,pendingPages:data.report.missing.length,dialoguePages:data.report.dialoguePages,fragments:data.report.fragments,indexCapturedAt:data.report.indexCapturedAt,completeGameCoverage:false};
 const meta=p=>({pageid:p.pageid,stageId:stageId(p.pageid),title:p.title,kind:p.kind,region:p.region,series:p.series,hasDialogue:p.hasDialogue,fragments:p.sections.length,revision:p.revision,issues:p.malformed||p.unresolvedTemplates.length>0});
 const stages=data.pages.filter(p=>p.sections.length).map(p=>({id:stageId(p.pageid),title:p.title,subtitle:'原文资料 · '+p.kind,category:'原文资料 · '+p.kind,kind:p.kind,region:p.region,series:p.series,sourceId:'corpus-source-'+p.pageid,scopeMode:'independent',contentType:'source',summary:'开放本页面已采集的全部文字，可能包含后续剧情与互斥选项。自动解析资料尚未逐条核对；不等于完整游戏对白。'+(p.loreSupplement?' 已补充关联任务正文，含后续剧情；引用指向原任务。':''),suggestions:['查找这页的任务描述','这页有哪些对话？'],taskTitles:[]}));
 for(const c of chapters)stages.push({id:c.id,title:c.parent.title,subtitle:c.chapter+' · '+c.region,category:'主线章节',kind:'魔神任务',region:c.region,chapter:c.chapter,chapterOrder:c.order,isMainChapter:true,childCount:c.children.length,scopeMode:'independent',contentType:'source',sourceId:'corpus-source-'+c.parent.pageid,taskTitles:c.children.map(p=>p.title),suggestions:['查找这页的任务描述','这页有哪些对话？'],summary:`开放从开篇至本章的 ${c.order+1} 个已入库主线章节及其明确关联子任务（含本章），后续章节仍未开放。间章按阅读顺序穿插；世界任务与人物专题需单独选择。原文自动解析，尚未逐条核对，片段不代表完整剧情。${c.children.length?'':'当前没有取得关联子任务，可能只能提供章节索引。'}${c.releaseStatus==='wiki_update_announcement_only'?'此章节来自 Wiki 更新专题，官方实装状态尚未独立核实。':''}`});
 const sources=[...data.pages,...(data.references??[]).filter(ref=>!data.pages.some(p=>p.pageid===ref.pageid))].map(p=>({id:'corpus-source-'+p.pageid,title:p.title,publisher:'原神 BWIKI 社区 · 自动采集',revision:String(p.revision),url:'https://wiki.biligame.com/ys/'+encodeURIComponent(p.title),gameVersion:'参见来源页',verifiedAt:p.capturedAt.slice(0,10),verificationLevel:'unreviewed-source',note:'采集日期不是人工核对日期。保留选项与条件标签；未展开的模板会标出。来源：CC BY-NC-SA 4.0；游戏内容权利归原权利人。'+(p.sourceWarnings??[]).map(w=>' '+w+'。').join('')+(p.malformed?' 来源源码存在未闭合模板，相关片段待复核。':'')+(p.reviewNotes??[]).map(n=>' 校对提示：'+n.note).join('')+(p.corrections??[]).map(n=>' 本地校正：'+n.reason).join('')+(p.staleCorrections?.length?' 原有本地校正因来源修订变化未套用，需复核。':''),snapshotSha256:p.sha256}));
 return {pages:data.pages,stages,sources,query(params){
  const q=(params.get('q')??'').trim().slice(0,100),kind=params.get('kind'),dialogue=params.get('dialogue')==='true',fulltext=params.get('fulltext')==='true';
  const found=data.pages.filter(p=>(!kind||p.kind===kind)&&(!dialogue||p.hasDialogue)&&(!q||[p.title,p.series,p.region].some(s=>s.includes(q))||fulltext&&p.sections.some(s=>s.text.includes(q))));
  const page=Math.max(1,Math.min(Math.ceil(found.length/30)||1,parseInt(params.get('page'),10)||1));
  return {items:found.slice((page-1)*30,page*30).map(meta),total:found.length,page,pageSize:30,kinds:[...new Set(data.pages.map(p=>p.kind))].sort(),report};
 },records(progress){const chapter=chapterByStage.get(progress),page=byStage.get(progress);if(!chapter&&!page)return null;return (chapter?chapterPagesThrough(chapters,chapter):[page]).flatMap(p=>{const occurrences=new Map();return p.sections.map((s,i)=>{const hash=createHash('sha256').update(JSON.stringify([s.path,s.text,...(s.origin?[s.origin]:[])])).digest('hex').slice(0,16),occurrence=occurrences.get(hash)??0;occurrences.set(hash,occurrence+1);return {id:`corpus-${p.pageid}-${p.revision}-${hash}-${occurrence}`,stage:progress,topic:s.path.at(-1)??p.title,section:`源码片段 ${i+1} · ${s.path.join(' / ')||'正文'}${s.origin?.section?' · '+s.origin.section:''}`,task:s.origin?.title??p.title,keywords:[p.title,...s.path].filter(s=>s.length>1),text:(p.reviewNotes??[]).filter(n=>s.path.some(x=>x.includes(n.match))).map(n=>'【校对待确认：'+n.note+'】\n').join('')+(s.path.length?'【'+s.path.join(' / ')+'】\n':'')+s.text,entities:[],sourceId:'corpus-source-'+(s.origin?.pageid??p.pageid),contentType:'source',linkedSource:!!s.origin,sourceKind:s.origin?.section?.startsWith('书籍字段：')?'book':undefined};});});}};
}
