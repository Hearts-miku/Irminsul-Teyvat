import{readFileSync,writeFileSync,readdirSync}from'node:fs';import{normalize}from'node:path';import{extractFile}from'@electron/asar';
const archive='.cache/package-current/win-unpacked/resources/app.asar';
const version=JSON.parse(extractFile(archive,'package.json')).version;
if(version!=='0.8.11')throw Error('错误版本');
const files=['server/ontology-chat.mjs','server/ontology-pilot.mjs','server/model.mjs','data/ontology-pilot.json','server/corpus.mjs','server/retrieval.mjs','server/app.mjs','data/corpus-lore-links.json','data/corpus/pages.json','data/program-content.json','data/semantic-reviews.json','data/corpus-activity-index.json','data/mondstadt-story.json','data/liyue-story.json','data/journey-bridge-story.json','data/outline-source-review.json','data/duplicate-reviews.json','data/source-gap-review.json','data/corpus-corrections.json','dist/index.html',...readdirSync('dist/assets').map(f=>'dist/assets/'+f)];
for(const f of files)if(!readFileSync(f).equals(extractFile(archive,normalize(f))))throw Error('归档不一致 '+f);
writeFileSync('test-results/package-source-check.json',JSON.stringify({version,passed:true,files},null,2)+'\n');console.log('归档逐字节验证 '+files.length+' 项');
