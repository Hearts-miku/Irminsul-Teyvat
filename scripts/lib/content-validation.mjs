import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export function validateChapter(chapter,receipt,{legacyReviewed=false}={}){
 const fail=m=>{throw Error(`${chapter.prefix??'chapter'}: ${m}`);};
 if(!chapter.sources||!Array.isArray(chapter.scopes)||!chapter.scopes.length)fail('内容结构不完整');
 if(!legacyReviewed&&(chapter.reviewStatus!=='reviewed'||!receipt))fail('未核对草稿不得入库');
 const ids=new Set();
 for(const scope of chapter.scopes){
  if(!Number.isSafeInteger(scope.id)||ids.has(scope.id)||!scope.title||!scope.coverage||!scope.sourceTitle||!scope.suggestions?.length||!scope.catalogTitles?.length||!scope.records?.length)fail('主题缺失字段或 ID 重复');ids.add(scope.id);
  for(const pattern of scope.spoilerPatterns??[])try{new RegExp(pattern);}catch{fail('剧透表达式无效');}
  const keys=new Set();for(const record of scope.records){
   if(!record.key||keys.has(record.key)||!record.text?.trim()||!record.keywords?.length)fail('资料缺失字段或 key 重复');keys.add(record.key);
   const source=chapter.sources[record.sourceKey];if(!source)fail('资料缺少来源');
   if(!legacyReviewed){
    const captured=receipt.pages.find(p=>p.key===record.sourceKey);
    if(!captured||captured.revision!==source.revision||captured.snapshotSha256!==source.snapshotSha256)fail('来源快照已变化，须重新核对');
    if(!record.evidenceAnchors?.length||record.evidenceAnchors.some(a=>!captured.sections.some(s=>s.anchor===a)))fail('缺少有效场景定位');
   }
  }
 }
 return chapter;
}
export function loadChapters(root='.'){
 const manifest=JSON.parse(readFileSync(join(root,'data/content-manifest.json'),'utf8'));
 const prefixes=new Set(),ids=new Set();return manifest.chapters.map(entry=>{
  if(!/^[a-z0-9-]+$/.test(entry.prefix)||!/^[-a-z0-9]+\.json$/.test(entry.file)||prefixes.has(entry.prefix))throw Error('章节清单路径无效或重复');prefixes.add(entry.prefix);
  const chapter={...JSON.parse(readFileSync(join(root,'data',entry.file),'utf8')),prefix:entry.prefix};
  const receipt=entry.legacyReviewed?null:JSON.parse(readFileSync(join(root,'data/source-receipts',entry.prefix+'.json'),'utf8'));
  validateChapter(chapter,receipt,entry);for(const s of chapter.scopes){if(ids.has(s.id))throw Error('跨章节主题 ID 重复');ids.add(s.id);}return chapter;
 });
}
