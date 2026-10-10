// Only explicit series membership creates a chapter relationship. Page IDs are
// navigation identifiers, never chronological progress or implied unlock order.
export function chapterScopes(pages,catalog){
 const byTitle=new Map(pages.map(p=>[p.title,p]));
 const scopes=[],seen=new Set();
 for(const [order,item] of catalog.filter(i=>i.kind==='archon').entries()){
  const parent=byTitle.get(item.title);if(!parent?.sections.length||seen.has(parent.pageid))continue;seen.add(parent.pageid);
  const aliases=new Set([parent.title,parent.title.replace(/（系列任务）$/,'')]);
  const children=pages.filter(p=>p.pageid!==parent.pageid&&p.sections.length&&p.series.split(',').some(name=>aliases.has(name.trim())));
  scopes.push({id:2000000000+parent.pageid,parent,children,order,chapter:item.chapter??'',region:item.region,releaseStatus:item.releaseStatus});
 }
 // Reading order: interludes are grouped at the end of the source index.
 // Place them among the main acts by their release-era position, not page ID.
 for(const [title,after] of [['风起鹤归','千手百眼，天下人间'],['危途疑踪','回响渊底的安魂曲'],['倾落伽蓝','虚空鼓动，劫火高扬'],['悖理','炽烈的还魂诗']]){
  const i=scopes.findIndex(c=>c.parent.title===title);
  if(i<0||!scopes.some(c=>c.parent.title===after))continue;
  const [entry]=scopes.splice(i,1);scopes.splice(scopes.findIndex(c=>c.parent.title===after)+1,0,entry);
 }
 return scopes.map((c,order)=>({...c,order}));
}

export function chapterPagesThrough(chapters,selected){
 return [...new Map(chapters.filter(c=>c.order<=selected.order).flatMap(c=>[c.parent,...c.children]).map(p=>[p.pageid,p])).values()];
}
