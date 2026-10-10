import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {loadChapters} from './lib/content-validation.mjs';
import {linkSources} from './lib/source-links.mjs';
import {applySemanticReviews} from './lib/semantic-reviews.mjs';

// The authored outline remains the source of truth. Do not promote it to dialogue evidence.
const base=JSON.parse(readFileSync('data/mondstadt-prologue.json','utf8'));
const snapshot=JSON.parse(readFileSync('data/catalog/index-snapshot.json','utf8'));
const clean=s=>s.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/\*\*/g,'').replace(/`/g,'').trim();
const numericId=s=>1000+parseInt(createHash('sha256').update(s).digest('hex').slice(0,7),16);
const guideDocs=[['MAIN-STORY.md','主线提纲'],['WORLD-STORY.md','支线提纲'],['NPC-DIALOGUE.md','NPC 提纲']];
const guides=[];
for(const [file,category] of guideDocs){
  const markdown=readFileSync(`docs/story-outline/${file}`,'utf8').replace(/\r\n/g,'\n');
  const parts=[...markdown.matchAll(/^#{2,3} (.+)\r?\n([\s\S]*?)(?=^#{2,3} |$(?![\s\S]))/gm)];
  for(const match of parts){
    const title=match[1].trim(),body=match[2].trim();
    if(!body)continue;
    const id=numericId(`${file}:${title}`),links=[...body.matchAll(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g)].map(m=>({title:m[1],url:m[2]}));
    const sourceId=`guide-source-${id}`;
    base.sources.push({id:sourceId,title:`${category} · ${title}`,publisher:'世界树-提瓦特提纲整理；外部索引：BWIKI',revision:'本地提纲 2026-09-30',url:links[0]?.url??`https://wiki.biligame.com/ys/${category==='NPC 提纲'?'NPC图鉴':category==='支线提纲'?'世界任务':'魔神任务'}`,gameVersion:'多版本，详见条目',localDocument:`docs/story-outline/${file}`,locator:title,links});
    // Preserve every section, including collection criteria, but label it as an outline.
    const paragraphs=body.replace(/```[\s\S]*?```/g,m=>m.replace(/```(?:text)?/g,'')).split(/\r?\n\s*\r?\n/).map(clean).filter(Boolean);
    const records=[];
    for(const paragraph of paragraphs){
      const chunks=paragraph.startsWith('|')?paragraph.split(/\r?\n/).filter(l=>!/^\|[\s|:-]+\|$/.test(l)).slice(1).map(l=>l.split('|').map(s=>s.trim()).filter(Boolean).join(' · ')):paragraph.split(/\r?\n(?=\d+\. |[-*] )/);
      for(const chunk of chunks){
        const text=chunk.replace(/^\d+\. |^[-*] /,'').trim();
        if(!text || text.length<8)continue;
        const topic=text.split(/[：:]/)[0].slice(0,45);
        const recordId=`guide-${id}-${createHash('sha256').update(text).digest('hex').slice(0,12)}`;
        if(!records.some(r=>r.id===recordId))records.push({id:recordId,stage:id,topic,section:title,entities:[],keywords:[title,topic],text,contentType:'outline',sourceId});
      }
    }
    if(!records.length)continue;
    const stage={id,title,subtitle:category,category,sourceId,scopeMode:'independent',contentType:'outline',summary:'提纲导览，包含本主题后续线索；不是完整剧情或逐句对白。',suggestions:[`概括${title}的提纲`,'这部分还有哪些内容待核对？']};
    base.stages.push(stage);base.records.push(...records);
    guides.push({id,title,category,records:records.length,links,text:records.map(r=>r.text).join('\n')});
  }
}
const chapters=loadChapters();
const curated=[...JSON.parse(readFileSync('data/story-expansion.json','utf8')),...chapters.flatMap(chapter=>chapter.scopes.map(scope=>({...scope,chapter})))];
for(const chapter of chapters)for(const [key,source] of Object.entries(chapter.sources)){
  base.sources.push({id:`${chapter.prefix}-${key}`,title:source.title,publisher:'原神 BWIKI 社区；世界树-提瓦特自行归纳',revision:source.revision??'未固定修订号',url:source.revision?`https://wiki.biligame.com/ys/index.php?title=${encodeURIComponent(source.title)}&oldid=${source.revision}`:`https://wiki.biligame.com/ys/${encodeURIComponent(source.title)}`,gameVersion:'参见任务来源',verifiedAt:chapter.reviewedAt,locator:source.locator,verificationLevel:source.verificationLevel,note:source.note});
}
for(const scope of curated){
  const sourceId=`story-source-${scope.id}`;
  base.sources.push({id:sourceId,title:scope.sourceTitle,publisher:'原神 BWIKI 社区；世界树-提瓦特自行归纳',revision:scope.revision??'读取页面未固定修订号',url:scope.revision?`https://wiki.biligame.com/ys/index.php?title=${encodeURIComponent(scope.sourceTitle)}&oldid=${scope.revision}`:`https://wiki.biligame.com/ys/${encodeURIComponent(scope.sourceTitle)}`,gameVersion:'参见任务来源',verifiedAt:'2026-09-30',locator:scope.locator});
  base.stages.push({id:scope.id,title:scope.title,subtitle:scope.category,category:scope.category,sourceId,scopeMode:'independent',contentType:'summary',summary:scope.coverage,suggestions:scope.suggestions,aliases:scope.catalogTitles,taskTitles:scope.taskTitles??[],spoilerPatterns:scope.spoilerPatterns??[]});
  scope.records.forEach((r,i)=>{
    const source=r.sourceKey?scope.chapter?.sources[r.sourceKey]:null;
    if(r.sourceKey&&!source)throw new Error(`缺少子任务来源：${r.sourceKey}`);
    const recordSourceId=r.sourceTitle?`record-source-${scope.id}-${i+1}`:null;
    if(recordSourceId)base.sources.push({id:recordSourceId,title:r.sourceTitle,publisher:'原神 BWIKI 社区；世界树-提瓦特自行归纳',revision:r.sourceRevision,verificationLevel:r.sourceVerificationLevel,url:`https://wiki.biligame.com/ys/index.php?title=${encodeURIComponent(r.sourceTitle)}&oldid=${r.sourceRevision}`,gameVersion:'参见任务来源',locator:r.section});
    base.records.push({...r,id:`story-${scope.id}-${r.key??i+1}`,stage:scope.id,section:r.section??source?.locator??scope.locator,entities:[],contentType:'summary',sourceId:recordSourceId??(source?`${scope.chapter.prefix}-${r.sourceKey}`:sourceId)});
  });
}
base.version=JSON.parse(readFileSync('package.json','utf8')).version;base.verifiedAt='2026-09-30';base.title='提瓦特剧情手记';base.chapter='主线、支线与 NPC';
base.coverage='完整接入现有目录快照和三份提纲；精选剧情摘要与提纲分开标记。目录含跨页重复和待核对条目，未收录全量逐句对白。';
// Matching is for navigation only. A linked guide never marks a catalog entry as complete.
const normalized=s=>s.replace(/[\s，。、·「」“”！!？?（）()：:]/g,'');
const items=snapshot.items.map(item=>({...item,guideIds:guides.filter(g=>normalized(g.text+' '+g.title).includes(normalized(item.title)) && normalized(item.title).length>=3).map(g=>g.id),summaryIds:curated.filter(s=>s.catalogTitles.some(t=>normalized(t)===normalized(item.title))).map(s=>s.id)}));
const counts={catalog:items.length,outlineScopes:guides.length,outlineRecords:base.records.filter(r=>r.contentType==='outline').length,summaryScopes:curated.length,summaryRecords:base.records.filter(r=>r.contentType==='summary').length,originalRecords:14};
const outlineReview=JSON.parse(readFileSync('data/outline-source-review.json','utf8'));
for(const review of outlineReview.records){const r=base.records.find(r=>r.id===review.id);if(!r||createHash('sha256').update(r.text).digest('hex')!==review.textHash)throw Error('提纲关联复核已过期：'+review.id);r.sourceTitles=review.sourceTitles;r.navigationReview={status:review.status,note:review.note,checkedAt:outlineReview.checkedAt};}
const alignment=linkSources(base,JSON.parse(readFileSync('data/corpus/pages.json','utf8')).pages,items,JSON.parse(readFileSync('data/corpus-title-aliases.json','utf8')));
applySemanticReviews(base,JSON.parse(readFileSync('data/corpus/pages.json','utf8')).pages,JSON.parse(readFileSync('data/semantic-reviews.json','utf8')));
counts.sourceLinked=alignment.catalogLinked;
for(const field of ['stages','sources','records'])if(new Set(base[field].map(x=>x.id)).size!==base[field].length)throw new Error(`内容包 ${field} ID 重复`);
writeFileSync('data/program-content.json',JSON.stringify(base,null,2)+'\n');
writeFileSync('data/catalog/program-index.json',JSON.stringify({capturedOn:snapshot.capturedOn,license:snapshot.license,sources:snapshot.sources,counts,items})+'\n');
console.log(JSON.stringify(counts));
