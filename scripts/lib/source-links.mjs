// These are navigation associations, never assertions that a paraphrase is verified.
export function sourceTitle(url){try{const u=new URL(url);if(u.hostname!=='wiki.biligame.com'||!u.pathname.startsWith('/ys/'))return null;return u.searchParams.get('title')??decodeURIComponent(u.pathname.slice(4)).replaceAll('_',' ');}catch{return null;}}
export function linkSources(pack,pages,items,aliases=[]){
 const byTitle=new Map(pages.map(p=>[p.title,p])),sources=new Map(pack.sources.map(s=>[s.id,s])),stages=new Map(pack.stages.map(s=>[s.id,s]));
 const link=p=>({pageid:p.pageid,stageId:1000000000+p.pageid,title:p.title,revision:p.revision,sha256:p.sha256,region:p.region,location:p.location??'',nationality:p.nationality??'',relation:'explicit-title',verification:'navigation-only'});
 const normalize=s=>String(s??'').replace(/[\s·.，,。、「」“”！!？?（）()：:《》]/g,'');
 const compatible=(p,item)=>!item.kind||item.kind==='npc'?(!item.kind||(p.categories??[]).includes('分类:NPC')):!(p.categories??[]).includes('分类:NPC');
 for(const item of items){
  let matched=pages.filter(p=>p.title===item.title&&compatible(p,item)),relation='explicit-title';
  if(!matched.length){const redirected=aliases.find(a=>a.from===item.title);if(redirected){matched=pages.filter(p=>p.title===redirected.to&&compatible(p,item));relation='source-redirect';}}
  if(!matched.length&&['hangout','anecdote'].includes(item.kind)&&item.character){matched=pages.filter(p=>(p.categories??[]).includes('分类:'+(item.kind==='hangout'?'邀约事件':'游逸旅闻'))&&((p.dedicatedCharacter??'').split(/[、,，]/).includes(item.character)||item.kind==='anecdote'&&(p.series??'').split(/[、,，]/).includes('逸闻·'+item.character)));relation='source-character-field';}
  if(!matched.length){matched=pages.filter(p=>compatible(p,item)&&[p.title,p.displayTitle,...p.names??[]].filter(Boolean).some(name=>normalize(name)===normalize(item.title)));relation='source-name-field';}
  item.sourcePages=matched.map(p=>({...link(p),relation}));
 }
 for(const record of pack.records){const source=sources.get(record.sourceId??stages.get(record.stage)?.sourceId),candidates=[source?.url,...(source?.links??[]).map(l=>l.url)].map(sourceTitle).filter(Boolean);candidates.push(...record.sourceTitles??[]);
  if(record.contentType==='outline'){const topic=normalize(record.text.split(/[：:]/)[0]);const exact=pages.filter(p=>normalize(p.title)===topic);if(exact.length===1)candidates.push(exact[0].title);}
  const matched=[...new Set(candidates)].map(t=>byTitle.get(t)).filter(Boolean);record.sourcePages=matched.map(link);record.sourceAlignment={status:matched.length?'page-linked-unreviewed':'no-exact-page',sameRevision:matched.some(p=>String(p.revision)===String(source?.revision)),quoteMatched:!!record.quote&&matched.some(p=>p.sections.some(s=>s.text.replace(/\s/g,'').includes(record.quote.replace(/\s/g,''))))};}
 return {records:pack.records.length,linkedRecords:pack.records.filter(r=>r.sourcePages.length).length,quotedRecords:pack.records.filter(r=>r.quote).length,matchedQuotes:pack.records.filter(r=>r.sourceAlignment.quoteMatched&&r.sourceAlignment.sameRevision).length,catalogLinked:items.filter(i=>i.sourcePages.length).length};
}
