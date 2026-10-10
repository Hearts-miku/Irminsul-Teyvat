import {applyLoreLinks} from './lib/lore-links.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {parseCorpusText,plainWiki} from './lib/corpus-text.mjs';
import {digest} from './lib/story-sources.mjs';
import {referenceResolver} from './lib/transclusions.mjs';
import {dynamicIndexResolver} from './lib/dynamic-index.mjs';
import {applyCorpusCorrections} from './lib/corpus-corrections.mjs';
import {parseCharacterNarrative} from './lib/character-narrative.mjs';
const dir='.cache/corpus',index=JSON.parse(readFileSync(join(dir,'index.json'),'utf8'));
const supplements=JSON.parse(readFileSync('data/corpus-supplements.json','utf8'));
for(const p of supplements)if(!index.pages.some(e=>e.pageid===p.pageid))index.pages.push(p);
const pages=[],missing=[],unreadable=[];
const references=existsSync(join(dir,'references.json'))?JSON.parse(readFileSync(join(dir,'references.json'),'utf8')):[];
const cached=index.pages.map(e=>join(dir,'pages',e.pageid+'.json')).filter(existsSync).map(path=>JSON.parse(readFileSync(path,'utf8')));
for(const ref of references)if(digest(ref.wikitext)!==ref.sha256)throw Error('引用源码哈希不匹配：'+ref.title);
const resolveReference=referenceResolver([...references,...cached]);
const activityIndex=JSON.parse(readFileSync('data/corpus-activity-index.json','utf8'));
const resolveIndex=dynamicIndexResolver(cached,{activityIndex,activitySources:references});
const reviewNotes=JSON.parse(readFileSync('data/corpus-review-notes.json','utf8'));
const corrections=JSON.parse(readFileSync('data/corpus-corrections.json','utf8'));
for(const entry of index.pages){
 const path=join(dir,'pages',entry.pageid+'.json');if(!existsSync(path)){missing.push(entry);continue;}
 const p=JSON.parse(readFileSync(path,'utf8'));if(digest(p.wikitext)!==p.sha256)throw Error('源码哈希不匹配：'+p.title);
 const corrected=applyCorpusCorrections(p,corrections);
 const narrativeOnly=supplements.some(s=>s.pageid===p.pageid&&s.contentSelection==='character-story');
 const parsed=narrativeOnly?parseCharacterNarrative(corrected.text):parseCorpusText(corrected.text,{pageTitle:p.title,resolveReference,resolveIndex});
 const field=name=>plainWiki(p.wikitext.match(new RegExp('\\|'+name+'\\s*=([^\\n]*)'))?.[1]??'');
 const kind=(narrativeOnly?'角色故事':'')||(p.categories.includes('分类:幻想真境剧诗角色信息')?'角色对话':'')||field('任务类型')||(['NPC','魔神任务','传说任务','邀约事件','部族纪闻','游逸旅闻','伴月纪闻','委托任务','活动任务','世界任务'].find(c=>p.categories.includes('分类:'+c)))||'任务';
 const region=field('任务地区')||field('所在国家')||field('所属国家')||'未标注';
 const location=field('位置'),nationality=field('所属国家');
 const series=field('系列任务');
 const hasDialogue=!narrativeOnly&&/角色\/幻想真境剧诗|NPC对话|NPC剧情|剧情选项|={2,6}\s*任务剧情/.test(p.wikitext);
 // Short answers such as “好。” and “再见。” are real branch content.
 const sections=parsed.sections.filter(s=>s.text.trim().length>0);
 if(!sections.length)unreadable.push({pageid:p.pageid,title:p.title});
 pages.push({pageid:p.pageid,title:p.title,revision:p.revision,capturedAt:p.capturedAt,sha256:p.sha256,categories:p.categories,kind,region,location,nationality,series,displayTitle:plainWiki(p.wikitext.match(/\{\{DISPLAYTITLE:([\s\S]*?)\}\}/)?.[1]??''),names:[field('名称'),field('全名'),field('任务名称'),field('系列任务名')].filter(Boolean),characters:field('出场人物').split(/[、,，]/).filter(Boolean),dedicatedCharacter:field('专属角色')||field('角色'),hasDialogue,sections,unresolvedTemplates:parsed.unresolvedTemplates,malformed:parsed.malformed,sourceWarnings:parsed.sourceWarnings,corrections:corrected.applied,staleCorrections:corrected.stale,reviewNotes:reviewNotes.filter(n=>n.pageid===p.pageid&&n.revision===p.revision).map(({match,note})=>({match,note}))});
}
const loreLinks=applyLoreLinks(pages,JSON.parse(readFileSync('data/corpus-lore-links.json','utf8')));
writeFileSync('test-results/lore-supplements.json',JSON.stringify(loreLinks,null,2)+'\n');
const report={builtAt:new Date().toISOString(),indexCapturedAt:index.capturedAt,indexedPages:index.pages.length,importedPages:pages.length,dialoguePages:pages.filter(p=>p.hasDialogue).length,fragments:pages.reduce((n,p)=>n+p.sections.length,0),missing,unreadable,malformed:pages.filter(p=>p.malformed).map(p=>({pageid:p.pageid,title:p.title})),unresolvedTemplatePages:pages.filter(p=>p.unresolvedTemplates.length).length,categories:index.categories,completeGameCoverage:false,reviewStatus:'unreviewed-source'};
report.categoryCoverage=index.categories.map(c=>({...c,imported:pages.filter(p=>p.categories.includes(c.title)).length}));
mkdirSync('data/corpus',{recursive:true});mkdirSync('test-results',{recursive:true});
writeFileSync('data/corpus/pages.json.tmp',JSON.stringify({report,pages,references:references.map(({wikitext,...p})=>p)})+'\n');renameSync('data/corpus/pages.json.tmp','data/corpus/pages.json');
writeFileSync('test-results/corpus-build.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('docs/CORPUS-COVERAGE.md',`# 原文资料采集覆盖\n\n生成时间：${report.builtAt}。分类快照：${index.capturedAt}。\n\n去重清单 ${index.pages.length} 页，已入库 ${pages.length} 页，待获取 ${missing.length} 页；含对白标记 ${report.dialoguePages} 页，自动解析 ${report.fragments} 个片段。未声明完整游戏覆盖，未将原文片段标为已核对摘要。\n\n| 来源分类 | 分类页面 | 已获取 |\n| --- | ---: | ---: |\n${report.categoryCoverage.map(c=>`| ${c.title} | ${c.count} | ${c.imported} |`).join('\n')}\n\n分类相互重叠，不能相加；系列入口可能只有元数据。大量世界任务归在“任务”分类，不能用“世界任务”分类的 91 页代表所有世界任务。该快照只是 Wiki 当前可枚举的分类集合，不证明游戏所有分支、台词、隐藏任务或未来内容已收录。\n\n解析待核对：${report.malformed.length} 页检测到未闭合模板；${report.unresolvedTemplatePages} 页含不支持的模板。正文保留未知模板标记或参数，但未做 MediaWiki 条件求值。\n\n完整缺口及页面 ID：\`test-results/corpus-build.json\` 的 missing、malformed、unreadable；原始源码缓存：\`.cache/corpus/pages/\`。\n`);
writeFileSync('docs/CORPUS-COVERAGE.md',readFileSync('docs/CORPUS-COVERAGE.md','utf8')+`\n分类外补充清单 ${supplements.length} 页。${pages.filter(p=>p.sourceWarnings?.some(w=>w.startsWith('来源内容缺失'))).length} 页带源站内容缺失提示，不能视为已补完。跨页引用只展开已缓存章节，引用来源元数据单独保存。\n`);
console.log(JSON.stringify({...report,missing:missing.length,unreadable:unreadable.length,malformed:report.malformed.length,categories:undefined}));
