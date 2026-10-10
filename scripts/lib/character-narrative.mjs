import {splitWiki,parseCorpusText} from './corpus-text.mjs';
// A character overview also contains combat values. Import only the story block.
export function parseCharacterNarrative(wikitext){
 const raw=wikitext.replace(/<!--[\s\S]*?-->/g,'');
 const starts=[...raw.matchAll(/\{\{角色\/故事(?=[|\s])/g)];
 if(starts.length!==1)throw Error('角色故事模板必须唯一');
 const start=starts[0].index;let depth=1,end=start+2;
 for(;end<raw.length&&depth;end++){if(raw.slice(end,end+2)==='{{'){depth++;end++;}else if(raw.slice(end,end+2)==='}}'){depth--;end++;}}
 if(depth)throw Error('角色故事模板未闭合');
 const fields=new Map();
 for(const part of splitWiki(raw.slice(start+2,end-2)).slice(1)){const pairs=splitWiki(part,'=');if(pairs.length<2)continue;const key=pairs.shift().trim();if(fields.has(key))throw Error('角色故事字段重复：'+key);fields.set(key,pairs.join('=').trim());}
 const sections=[],unresolvedTemplates=[],sourceWarnings=[];let malformed=false;
 for(const[key,value]of fields){if(!/^(角色详细|角色故事[1-5]|冒险笔记|神之眼|其他故事)$/.test(key)||!value)continue;
  const condition=fields.get(key+'解锁条件');
  const label=key==='冒险笔记'?(fields.get('冒险笔记名称')||key):key==='其他故事'?(fields.get('其他')||key):key;
  const parsed=parseCorpusText(value);
  sections.push(...parsed.sections.map(s=>({...s,path:['角色故事（非现场对白）',label,condition?'解锁条件：'+condition:'来源未明确该段解锁条件',...s.path]})));
  unresolvedTemplates.push(...parsed.unresolvedTemplates);sourceWarnings.push(...parsed.sourceWarnings);malformed ||= parsed.malformed;
 }
 if(!sections.length)sourceWarnings.push('来源内容缺失：角色故事字段为空');
 return{sections,unresolvedTemplates:[...new Set(unresolvedTemplates)],sourceWarnings:[...new Set(sourceWarnings)],malformed};
}
