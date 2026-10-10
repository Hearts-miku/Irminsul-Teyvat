import fs from 'node:fs';
import {requestJson,apiUrl,apiAllowed} from './lib/story-sources.mjs';
const name=process.argv[2];
if(!/^v\d+-[a-z-]+$/.test(name??''))throw Error('需要版本化的复核清单名称');
const titles=JSON.parse(fs.readFileSync(`.cache/review/${name}-plan.json`));
if(!Array.isArray(titles)||titles.some(t=>typeof t!=='string'||!t||/[|\r\n]/.test(t)))throw Error('标题清单无效');
const path=`.cache/review/${name}-sources.json`;
const report=fs.existsSync(path)?JSON.parse(fs.readFileSync(path)):{titles,batches:[]};
if(JSON.stringify(report.titles)!==JSON.stringify(titles))throw Error('续传清单变化');
const response=await fetch('https://wiki.biligame.com/robots.txt',{signal:AbortSignal.timeout(20000),redirect:'error'});
if(!response.ok)throw Error('无法读取 robots.txt');
const robots=await response.text();
for(let i=report.batches.length*50;i<titles.length;i+=50){
 await new Promise(r=>setTimeout(r,15000));
 const params={action:'query',prop:'revisions|categories',rvprop:'ids|content',rvslots:'main',cllimit:'500',redirects:'1',titles:titles.slice(i,i+50).join('|')};
 if(!apiAllowed(robots,apiUrl(params)))throw Error('robots 不允许请求');
 const data=await requestJson(params);
 if(data.continue)throw Error('分类响应未完整，不能自动应用');
 report.batches.push({requested:titles.slice(i,i+50),capturedAt:new Date().toISOString(),response:data});
 fs.writeFileSync(path,JSON.stringify(report));
 console.log(JSON.stringify({processed:Math.min(i+50,titles.length),total:titles.length}));
}
