import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {validatePlan,digest} from './lib/story-sources.mjs';
const id=process.argv[2]??'journey-bridge';if(!/^[a-z0-9-]+$/.test(id))throw Error('清单 ID 无效');
const plan=validatePlan(JSON.parse(readFileSync(`data/collection-plans/${id}.json`,'utf8'))),sources={},pages=[],reviewQueue=[];
for(const item of plan.pages){
 const p=JSON.parse(readFileSync(`.cache/story-sources/${id}/${item.key}.json`,'utf8'));if(digest(p.html)!==p.snapshotSha256)throw Error('缓存校验失败');
 sources[item.key]={title:p.title,revision:p.revision,snapshotSha256:p.snapshotSha256,capturedAt:p.capturedAt,verificationLevel:'pending',locator:'待核对'};
 pages.push({key:item.key,title:p.title,revision:p.revision,snapshotSha256:p.snapshotSha256,capturedAt:p.capturedAt,url:p.url,sections:p.sections.map(s=>({title:s.title,anchor:s.anchor,path:s.path,textSha256:digest(s.text),requiresBranchReview:s.requiresBranchReview}))});
 for(const section of p.sections)reviewQueue.push({key:digest(item.key+'|'+section.anchor).slice(0,12),sourceKey:item.key,section:section.path.join(' / '),evidenceAnchors:[section.anchor],requiresBranchReview:section.requiresBranchReview,sourceCharacters:section.text.length,reviewStatus:'pending',text:'',keywords:[]});
}
mkdirSync('.cache/story-drafts',{recursive:true});const file=`.cache/story-drafts/${id}.json`;if(existsSync(file))throw Error('草稿已存在，未覆盖；请先保存或更名后再生成');
writeFileSync(file,JSON.stringify({id,reviewStatus:'unreviewed',sources,receipt:{plan:id,pages},scopes:[],reviewQueue},null,2)+'\n');console.log(JSON.stringify({file,pages:pages.length,reviewItems:reviewQueue.length,published:false}));
