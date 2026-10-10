import {createHash} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function validatePlan(plan){
 if(!/^[a-z0-9-]+$/.test(plan.id)||!Array.isArray(plan.pages)||!plan.pages.length||plan.pages.length>50)throw Error('采集清单必须有安全 ID 和 1 至 50 个明确页面');
 const keys=new Set(),titles=new Set();for(const p of plan.pages){if(!/^[a-z0-9-]+$/.test(p.key)||typeof p.title!=='string'||!p.title.trim()||/[|\n\r]/.test(p.title)||keys.has(p.key)||titles.has(p.title))throw Error('采集页面重复或格式无效');keys.add(p.key);titles.add(p.title);}
 return plan;
}
export function apiUrl(params){return 'https://wiki.biligame.com/ys/api.php?'+new URLSearchParams({format:'json',formatversion:'2',maxlag:'5',...params});}
export async function requestJson(params,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetcher(apiUrl(params),{headers:{'User-Agent':'WindborneStoriesPrototype/0.5 (local noncommercial story research)'},signal:AbortSignal.timeout(20000),redirect:'error'});
  if([429,503].includes(response.status)){if(attempt===2)throw Error('站点限流，稍后再试');const delay=Number(response.headers.get('retry-after'))*1000;await sleep(Math.min(30000,Math.max(1000,delay||2000*2**attempt)));continue;}
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const data=await response.json();if(data.error?.code==='maxlag'&&attempt<2){await sleep(2000*2**attempt);continue;}
  if(data.error)throw Error(`API ${data.error.code}: ${data.error.info}`);return data;
 }
 throw Error('请求重试已用尽');
}
// The collector only requests this API path; robots restrictions apply to query strings too.
export function apiAllowed(robots,url=apiUrl({action:'parse',page:'example'})){
 const groups=[];let group=null,hasRules=false;
 for(const raw of robots.split(/\r?\n/)){const line=raw.replace(/#.*/,'').trim(),m=line.match(/^(User-agent|Disallow|Allow):\s*(.*)$/i);if(!m)continue;
  if(m[1].toLowerCase()==='user-agent'){if(!group||hasRules){group={agents:[],rules:[]};groups.push(group);hasRules=false;}group.agents.push(m[2].toLowerCase());}
  else if(group){hasRules=true;group.rules.push({allow:m[1].toLowerCase()==='allow',pattern:m[2]});}
 }
 const specific=groups.filter(g=>g.agents.some(a=>a!=='*'&&'windbornestoriesprototype'.includes(a))),applicable=specific.length?specific:groups.filter(g=>g.agents.includes('*'));
 const parsed=new URL(url),path=parsed.pathname+parsed.search;const matches=[];
 for(const g of applicable)for(const rule of g.rules){if(!rule.pattern)continue;const regex='^'+rule.pattern.split('*').map(s=>s.replace(/[.+?^{}()|[\]\\]/g,'\\$&')).join('.*');if(new RegExp(regex).test(path))matches.push(rule);}
 matches.sort((a,b)=>b.pattern.length-a.pattern.length||Number(b.allow)-Number(a.allow));return !matches.length||matches[0].allow;
}
export async function extractSections(page,html){
 // Render only in a script-disabled context with every request blocked; never execute wiki scripts.
 await page.setContent(html,{waitUntil:'domcontentloaded'});
 return page.evaluate(()=>{
  document.querySelectorAll('script,style,link,iframe,object,embed,.mw-editsection,.toc').forEach(e=>e.remove());
  const root=document.querySelector('.mw-parser-output')??document.body;
  const headings=[...root.querySelectorAll('h2,h3,h4,h5,h6')];
  const clean=s=>s.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const sections=[],path=[];
  for(let i=0;i<headings.length;i++){
   const h=headings[i],level=+h.tagName.slice(1);path.length=level-2;path[level-2]=clean(h.textContent);
   const range=document.createRange();range.setStartAfter(h);if(headings[i+1])range.setEndBefore(headings[i+1]);else range.setEnd(root,root.childNodes.length);
   const box=document.createElement('div');box.append(range.cloneContents());box.querySelectorAll('br').forEach(e=>e.replaceWith('\n'));box.querySelectorAll('p,li,tr,div').forEach(e=>e.append('\n'));
   const text=clean(box.textContent);if(text)sections.push({title:clean(h.textContent),anchor:h.querySelector('[id]')?.id??h.id,path:path.filter(Boolean),text,requiresBranchReview:/选项|折叠|旅行者：|MediaWiki:PlotOptions/.test(text)});
  }
  return sections;
 });
}
