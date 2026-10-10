import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,normalize} from 'node:path';
import {extractFile} from '@electron/asar';
const archive=process.argv[2]??'.cache/package-current/win-unpacked/resources/app.asar';
const expected=JSON.parse(readFileSync('package.json')),actual=JSON.parse(extractFile(archive,'package.json'));
if(actual.version!==expected.version||actual.name!==expected.name)throw Error('打包名称或版本不一致');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const checked=['dist','electron','server','data'].flatMap(files);
for(const path of checked)if(!readFileSync(path).equals(extractFile(archive,normalize(path))))throw Error('归档不一致 '+path);
writeFileSync('test-results/package-source-check.json',JSON.stringify({version:actual.version,archive,passed:true,files:checked},null,2)+'\n');
console.log('归档逐字节验证 '+checked.length+' 项，版本 '+actual.version);
