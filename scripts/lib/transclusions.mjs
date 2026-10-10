import {plainWiki,splitWiki} from './corpus-text.mjs';
export function selectSection(text,title){
 const headings=[...text.matchAll(/^(={1,6})\s*(.*?)\s*\1\s*$/gm)],matches=headings.filter(m=>plainWiki(m[2])===plainWiki(title));
 if(matches.length!==1)return null;const h=matches[0],next=headings.find(m=>m.index>h.index&&m[1].length<=h[1].length);return text.slice(h.index,next?.index??text.length);
}
export function selectBookField(text,field){
 if(!/^卷[1-9]\d*内容$/.test(field))return null;
 const clean=text.replace(/<!--[\s\S]*?-->/g,'').trim();if(!/^\{\{书籍[|\s]/.test(clean))return null;
 let depth=0,end=-1;for(let i=0;i<clean.length-1;i++){const pair=clean.slice(i,i+2);if(pair==='{{'){depth++;i++;}else if(pair==='}}'){depth--;i++;if(depth===0){end=i-1;break;}}}if(end<0)return null;
 const matches=splitWiki(clean.slice(2,end)).slice(1).map(p=>{const parts=splitWiki(p,'=');return{name:parts.shift().trim(),value:parts.join('=')};}).filter(f=>f.name===field);return matches.length===1?matches[0].value:null;
}
export function referenceResolver(pages){const byTitle=new Map(pages.map(p=>[p.title,p]));return (title,section,field)=>{const p=byTitle.get(title);if(!p)return null;const text=field?selectBookField(p.wikitext,field):section?selectSection(p.wikitext,section):p.wikitext;if(text===null)return null;return {text,origin:{pageid:p.pageid,title:p.title,revision:p.revision,sha256:p.sha256,section:field?'书籍字段：'+field:section??'全文嵌入'}};};}
