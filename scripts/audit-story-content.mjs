import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {loadChapters} from './lib/content-validation.mjs';
const chapters=loadChapters(),catalog=JSON.parse(readFileSync('data/catalog/program-index.json','utf8'));
const changes=[];for(const chapter of chapters)for(const [key,source] of Object.entries(chapter.sources)){
 if(!source.snapshotSha256)continue;const path=`.cache/story-sources/${chapter.prefix}/${key}.json`;
 if(existsSync(path)){const cache=JSON.parse(readFileSync(path,'utf8'));if(cache.snapshotSha256!==source.snapshotSha256)changes.push({chapter:chapter.prefix,key,title:source.title,reviewedRevision:source.revision,currentRevision:cache.revision,status:'needs-review'});}
}
const main=catalog.items.filter(i=>i.kind==='archon'),pending=main.filter(i=>!i.summaryIds.length);
const report={generatedAt:new Date().toISOString(),catalogEntries:catalog.counts.catalog,storyRecords:catalog.counts.originalRecords+catalog.counts.summaryRecords,archonEntries:main.length,archonEntriesWithSummary:main.length-pending.length,fullDialogueComplete:false,sourceChanges:changes,pendingMainStory:pending.map(i=>({title:i.title,chapter:i.chapter,sourceUrl:i.sourceUrl}))};
mkdirSync('test-results',{recursive:true});writeFileSync('test-results/content-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({storyRecords:report.storyRecords,archonEntriesWithSummary:report.archonEntriesWithSummary,pendingMainStory:pending.length,sourceChanges:changes.length}));if(changes.length)process.exitCode=1;
