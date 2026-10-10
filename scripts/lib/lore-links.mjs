import {digest} from './story-sources.mjs';
// Resolve against the unextended corpus so links cannot recursively copy links.
export function applyLoreLinks(pages,entries){
 const originals=new Map(pages.map(p=>[p.pageid,{...p,sections:[...p.sections]}]));
 const report=[];
 for(const entry of entries){
  const target=pages.find(p=>p.pageid===entry.pageid);
  if(!target||target.revision!==entry.revision||target.sha256!==entry.sha256)throw Error('世界观入口来源变化：'+entry.pageid);
  const added=[];
  for(const link of entry.links){
   const source=originals.get(link.pageid);
   if(!source||source.pageid===target.pageid||source.revision!==link.revision||source.sha256!==link.sha256)throw Error('世界观关联来源变化：'+link.pageid);
   for(const fragment of link.fragments){
    const s=source.sections[fragment.index];
    if(!s||s.origin||digest(JSON.stringify([s.path,s.text]))!==fragment.hash)throw Error('世界观关联片段变化：'+link.pageid);
    added.push({...s,path:['关联任务正文（含后续剧情，非本页现场对白）',source.title,...s.path],origin:{pageid:source.pageid,title:source.title,revision:source.revision,sha256:source.sha256,section:'世界观补充 · '+s.path.join(' / ')}});
   }
  }
  target.sections.push(...added);
  target.loreSupplement={note:entry.note,fragments:added.length,titles:entry.links.map(l=>originals.get(l.pageid).title)};
  report.push({pageid:target.pageid,title:target.title,...target.loreSupplement});
 }
 return report;
}
