import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {requestJson,apiAllowed,apiUrl,digest} from './lib/story-sources.mjs';

// Public, read-only category enumeration. Resume is the default; refresh is explicit.
const dir='.cache/corpus';mkdirSync(join(dir,'pages'),{recursive:true});
const atomic=(path,value)=>{writeFileSync(path+'.tmp',JSON.stringify(value)+'\n');renameSync(path+'.tmp',path);};
const categories=['魔神任务','传说任务','世界任务','任务','NPC','邀约事件','委托任务','活动任务','部族纪闻','游逸旅闻','伴月纪闻'];
const refresh=process.argv.includes('--refresh');
const report={startedAt:new Date().toISOString(),categories:[],fetched:0,cached:0,missing:[],failures:[],complete:false};
let last=0,robots='';
async function request(params){
 if(!apiAllowed(robots,apiUrl(params)))throw Error('robots.txt forbids request');
 await new Promise(r=>setTimeout(r,Math.max(0,15000-(Date.now()-last))));
 try{return await requestJson(params);}finally{last=Date.now();}
}
const indexPath=join(dir,'index.json');let index;
try{
 const robotsResponse=await fetch('https://wiki.biligame.com/robots.txt',{signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!robotsResponse.ok)throw Error('robots.txt unavailable: HTTP '+robotsResponse.status);
 robots=await robotsResponse.text();writeFileSync(join(dir,'robots.txt'),robots);
 if(existsSync(indexPath)&&!refresh){index=JSON.parse(readFileSync(indexPath,'utf8'));report.categories=index.categories;}
 else{
  const pages=new Map(),queue=categories.map(title=>'分类:'+title),seen=new Set();
  for(let n=0;n<queue.length;n++){
   const category=queue[n];if(seen.has(category))continue;seen.add(category);let continuation={},count=0;
   do{
    const result=await request({action:'query',list:'categorymembers',cmtitle:category,cmtype:'page|subcat',cmlimit:'500',...continuation});
    for(const row of result.query?.categorymembers??[]){
     if(row.ns===14){if(!seen.has(row.title))queue.push(row.title);continue;}
     if(row.ns!==0)continue;count++;const p=pages.get(row.pageid)??{pageid:row.pageid,title:row.title,categories:[]};
     if(!p.categories.includes(category))p.categories.push(category);pages.set(row.pageid,p);
    }
    continuation=result.continue;
   }while(continuation);
   report.categories.push({title:category,count});console.log(JSON.stringify({category,count,pages:pages.size}));
  }
  index={capturedAt:new Date().toISOString(),categories:report.categories,pages:[...pages.values()]};atomic(indexPath,index);
 }
 const pending=[];
 for(const p of index.pages){const path=join(dir,'pages',p.pageid+'.json');
  if(!refresh&&existsSync(path)){try{const old=JSON.parse(readFileSync(path,'utf8'));if(old.pageid===p.pageid&&digest(old.wikitext)===old.sha256){report.cached++;continue;}}catch{}}
  pending.push(p);
 }
 // Interleave NPC and quest pages so an interrupted run does not leave a whole
 // requested content family until the end of the queue.
 const npc=pending.filter(p=>p.categories.includes('分类:NPC')),quests=pending.filter(p=>!p.categories.includes('分类:NPC'));
 pending.length=0;for(let i=0;i<Math.max(npc.length,quests.length);i++){if(npc[i])pending.push(npc[i]);if(quests[i])pending.push(quests[i]);}
 for(let offset=0;offset<pending.length;offset+=50){
  const batch=pending.slice(offset,offset+50);
  try{
   const response=await request({action:'query',prop:'revisions',rvprop:'ids|content',rvslots:'main',pageids:batch.map(p=>p.pageid).join('|')});
   for(const p of batch){const row=response.query?.pages?.find(r=>r.pageid===p.pageid),revision=row?.revisions?.[0],wikitext=revision?.slots?.main?.content;
    if(typeof wikitext!=='string'){report.missing.push({pageid:p.pageid,title:p.title});continue;}
    atomic(join(dir,'pages',p.pageid+'.json'),{...p,title:row.title,revision:revision.revid,capturedAt:new Date().toISOString(),sha256:digest(wikitext),wikitext});report.fetched++;
   }
  }catch(error){report.failures.push({pages:batch.map(p=>p.pageid),error:error.message});
   // Stop on service failures; preserve successful files and allow explicit resume.
   throw error;
  }
  atomic(join(dir,'report.json'),{...report,total:index.pages.length,processed:Math.min(offset+50,pending.length),remaining:Math.max(0,pending.length-offset-50)});
  console.log(JSON.stringify({fetched:report.fetched,cached:report.cached,total:index.pages.length,remaining:Math.max(0,pending.length-offset-50),failures:report.failures.length}));
 }
 report.complete=!report.failures.length&&!report.missing.length;report.total=index.pages.length;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();atomic(join(dir,'report.json'),report);console.log(JSON.stringify(report));if(!report.complete)process.exitCode=1;}
