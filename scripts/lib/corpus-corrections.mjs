export function applyCorpusCorrections(page,patches){
 let text=page.wikitext;const applied=[],stale=[];
 for(const patch of patches.filter(p=>p.pageid===page.pageid)){
  if(page.revision!==patch.revision||page.sha256!==patch.sha256){stale.push(patch.id);continue;}
  if(!patch.find||text.split(patch.find).length!==2)throw Error('校正定位不唯一：'+patch.id);
  text=text.replace(patch.find,patch.replace);applied.push({id:patch.id,reason:patch.reason,evidence:patch.evidence});
 }
 return {text,applied,stale};
}
