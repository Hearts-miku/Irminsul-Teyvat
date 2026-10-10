import {plainWiki} from './corpus-text.mjs';
// Navigation metadata only: never infer participation from a name in prose.
export function dynamicIndexResolver(pages,{activityIndex,activitySources=[]}={}){
 const activityById=new Map(activitySources.map(p=>[p.pageid,p]));
 const entries=pages.map(p=>{const raw=p.wikitext.replace(/<!--[\s\S]*?-->/g,'');const field=name=>plainWiki(raw.match(new RegExp('\\|'+name+'\\s*=([^\\n]*)'))?.[1]??'');return {p,series:field('系列任务').split(/[、,，]/).map(s=>s.trim()),characters:field('出场人物').split(/[、,，]/).map(s=>s.trim()),description:field('描述'),order:field('编号'),subtitle:field('副标题')};});
 return(kind,value)=>{if(kind==='character-activities'){
 const listing=activityIndex?.characters?.[value];if(!Array.isArray(listing))return null;
 const rows=[];for(const entry of listing){const p=activityById.get(entry.pageid);if(!p||p.revision!==entry.revision||p.sha256!==entry.sha256)return null;rows.push({title:p.title,text:'【本次非剧情活动索引关联，不代表全部出场记录】'+p.title,origin:{pageid:p.pageid,title:p.title,revision:p.revision,sha256:p.sha256,section:'活动出场人物字段'}});}return {complete:false,queriedAt:activityIndex.capturedAt,rows};
 }if(!['series','character-tasks'].includes(kind)||!value)return null;const rows=entries.filter(e=>kind==='series'?(e.p.categories??[]).includes('分类:系列任务')&&e.series.includes(value):(e.p.categories??[]).includes('分类:任务')&&e.characters.includes(value));if(kind==='series')rows.sort((a,b)=>/^\d+$/.test(a.order)&&/^\d+$/.test(b.order)?Number(a.order)-Number(b.order):a.p.title.localeCompare(b.p.title,'zh-CN'));return {complete:false,rows:rows.map(({p,description,subtitle})=>({title:p.title,text:p.title+(kind==='series'?[(subtitle&&!subtitle.includes('{{')?'副标题：'+subtitle:''),(description&&!description.includes('{{')?'任务描述（来源元数据）：'+description:'')].filter(Boolean).map(s=>'\n'+s).join(''):''),origin:{pageid:p.pageid,title:p.title,revision:p.revision,sha256:p.sha256,section:kind==='series'?'系列任务归属字段':'出场人物字段'}}))};};
}
