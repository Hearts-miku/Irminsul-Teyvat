import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const root=resolve('.'), out=join(root,'docs','story-outline'), dataDir=join(root,'data','catalog');
mkdirSync(out,{recursive:true});mkdirSync(dataDir,{recursive:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const clean=s=>s.replace(/cite\d+†([^†]+)(?:†[^]*)?/g,'$1').replace(/\s+/g,' ').trim();
const links=s=>[...s.matchAll(/cite(\d+)†([^†]+)(?:†[^]*)?/g)].map(m=>({ref:m[1],label:m[2]})).filter(x=>!/^Image|^文件:|^https?:/.test(x.label));
const snapshotFile=join(dataDir,'index-snapshot.json');
// Refresh is a deliberate operation against locally captured public index pages.
// Default rebuilds use committed metadata only, with no network or API key.
if(process.argv.includes('--extract')){
 const pages=JSON.parse(readFileSync(join(root,'.cache','story-index','web-final.json'),'utf8'));
 const sources=pages.map((p,i)=>{
  const map=new Map();for(const chunk of p.chunks)for(const m of chunk.matchAll(/L(\d+):\s*([\s\S]*?)(?=L\d+:|$)/g))map.set(+m[1],m[2].trim());
  const all=p.chunks.join('\n'),revision=all.match(/oldid=(\d+)/)?.[1]??null;
  const rows=[...map].sort((a,b)=>a[0]-b[0]);const total=Number(all.match(/Total lines: (\d+)/)?.[1]||0);
  const data={id:'src-'+(i+1),title:p.title,url:p.url,revision,capturedOn:'2026-09-30',crawlNote:all.match(/Crawled: ([^;]+);/)?.[1]??null,totalLines:total,status:total>1?'read':'unavailable',rows};
  return data;
 });
 const items=[];
 function add(s,n,title,kind,group,region,extra={}){
  if(!title)return;
  items.push({id:kind+'-'+hash(s.id+'|'+n+'|'+title).slice(0,14),title,kind,group,region:region||'待核对',sourceId:s.id,sourceLine:n,sourceUrl:s.url,sourceRevision:s.revision,
   // Display labels may not be canonical page titles; retain a search link, not a guessed canonical URL.
   lookupUrl:'https://wiki.biligame.com/ys/index.php?search='+encodeURIComponent(title),
   status:'indexed',dialogueStatus:'pending',releaseStatus:'not_independently_verified',...extra});
 }
 for(const s of sources){
  if(s.status!=='read')continue;
  if(s.title.startsWith('NPC图鉴/')){
   for(let i=0;i<s.rows.length;i++){
    if(s.rows[i][1]!=='NPC')continue;
    const block=[];for(let j=i+1;j<s.rows.length&&s.rows[j][1]!=='NPC';j++){if(s.rows[j][1].startsWith('取自'))break;if(s.rows[j][1])block.push(s.rows[j]);}
    const name=block.find(([n,t])=>!t.includes('cite')&&!t.includes('赠礼已完成'));
    if(!name)continue;const location=block.find(([n,t])=>n>name[0]&&!t.includes('cite')&&!t.includes('赠礼已完成'))?.[1]??'待核对';
    add(s,name[0],clean(name[1]),'npc',s.title.replace('NPC图鉴/','')+'索引分组','待核对',{location:clean(location),regionHint:s.title.replace('NPC图鉴/',''),identityStatus:'unresolved',hasDialogue:null});
   }
  }else if(s.title==='分类:NPC'){
   for(const[n,t]of s.rows)if(n>354&&n<562&&t.startsWith('*'))for(const l of links(t))add(s,n,l.label,'npc','旧分类索引补充','待核对',{location:'待核对',identityStatus:'unresolved',hasDialogue:null,sourceCaveat:'分类页抓取缓存较旧；仅作候选补充，不与同名人物自动合并'});
  }else if(s.title==='魔神任务'){
   let group='';for(const[n,t]of s.rows){if(t.startsWith('## '))group=clean(t.slice(3));const ls=links(t);if(group==='流浪者的足迹'&&t.startsWith('## '))add(s,n,'流浪者的足迹','archon','旅程开端','跨地区',{chapter:'开篇入口',granularity:'opening-index'});if(n>580&&ls.length===2&&ls[0].ref===ls[1].ref){const regions={'序章':'蒙德','第一章':'璃月','第二章':'稻妻','第三章':'须弥','第四章':'枫丹','第五章':'纳塔','第六章':'挪德卡莱','第七章':'至冬','间章':'跨地区'};let region=regions[group.split(' ')[0]];if(['我们终将重逢','回响渊底的安魂曲','卡利贝尔','睡前故事','你存在的时空'].includes(ls[1].label))region='旅人线 / 跨地区';if(/空月之歌 第(九|十)幕/.test(ls[0].label))region='须弥';add(s,n,ls[1].label,'archon',group,region,{chapter:ls[0].label});}}
  }else if(s.title==='邀约事件'){
   let section='',group='',region='',tribe='';for(const[n,t]of s.rows){if(n<578)continue;
    if(t.startsWith('## ')){section=clean(t.slice(3));tribe='';}
    if(t.startsWith('### ')){group=clean(t.slice(4));region=section==='版本活动'?'跨地区':group;tribe='';}
    if(t.startsWith('#### '))tribe=clean(t.slice(5));
    const ls=links(t);if(ls.length===2&&ls[0].ref===ls[1].ref){const kind=section==='传说任务和部族纪闻'?(tribe?'tribal':'story'):'event';add(s,n,ls[1].label,kind,tribe||group||section,region,{chapter:ls[0].label,section});}
    if(section==='邀约事件'&&!t.startsWith('#')&&ls.length===1)add(s,n,ls[0].label+' · 邀约','hangout',group,region,{character:ls[0].label,granularity:'character-index',note:'角色入口；各幕、全部结局和失败分支需进一步展开'});
   }
  }else if(s.title==='世界任务'){
   // Boundaries verified against this captured rendered index (revision 686522).
   const bounds=[[608,'蒙德'],[709,'璃月'],[798,'稻妻'],[928,'须弥'],[1118,'枫丹'],[1277,'纳塔'],[1411,'挪德卡莱'],[1548,'至冬'],[1578,'龙脊雪山'],[1592,'层岩巨渊·地下矿区'],[1616,'渊下宫'],[1655,'旧日之海'],[1681,'远古圣山'],[1699,'空之神殿'],[1736,'霜月']];
   if(s.revision!=='686522')throw new Error('世界任务源版本已变，需重新核对地区分界');
   let section='',series='';for(const[n,t]of s.rows){if(n<608||n>=1762)continue;
    if(t.startsWith('## ')){section=clean(t.slice(3));series='';continue;}
    if(t==='* * *'||t==='其他任务'){series='';continue;}
    const ls=links(t);if(!ls.length)continue;const region=bounds.filter(([start])=>n>=start).at(-1)[1];
    const bullet=t.startsWith('*');if(!bullet)series=ls[0].label;
    for(const l of ls)add(s,n,l.label,'world',section,region,{series:bullet?series:'',granularity:bullet?'index-entry':'series-or-group',relationStatus:'index_layout_only'});
   }
  }else if(s.title==='委托任务'){
   let region='';for(const[n,t]of s.rows){if(t.startsWith('## '))region=clean(t.slice(3));if(t.startsWith('### '))add(s,n,clean(t.slice(4)),region==='非NPC委托'?'commission-combat':'commission',region,region==='非NPC委托'?'多地区':region);}
  }else if(s.title==='游逸旅闻'){
   let region='';for(const[n,t]of s.rows){if(n<578||n>951)continue;if(t.startsWith('## ')){region=clean(t.slice(3));continue;}const ls=links(t);if(ls.length===1)add(s,n,ls[0].label+' · 游逸旅闻','anecdote',region,region,{character:ls[0].label,granularity:'character-index'});}
  }else if(s.title==='银月之庭·伴月纪闻'){
   let group='';for(const[n,t]of s.rows){if(n<585||n>=620)continue;if(t.startsWith('### ')){group=clean(t.slice(4));if(/无人的庭园|如月之恒/.test(group))add(s,n,links(t)[0]?.label??group,'moon',group,'挪德卡莱 / 霜月');}else if(t.includes('|')&&links(t).length)add(s,n,links(t)[0].label,'moon',group,'挪德卡莱 / 霜月');}
  }
 }
 const update=sources.find(s=>s.title.startsWith('7.1版本'));
 if(update){for(const title of ['白夜似梦初醒','往冥府的安魂歌','风仙亦是仙，古剑通幽玄！','溯流的变奏曲']){
 const line=update.rows.find(([n,t])=>n>500&&clean(t).includes(title));if(line)add(update,line[0],title,['白夜似梦初醒','往冥府的安魂歌'].includes(title)?'archon':'world','7.1 更新专题补充','至冬',{chapter:title==='白夜似梦初醒'?'第七章 第三幕':title==='往冥府的安魂歌'?'第七章 第四幕':'',releaseStatus:'wiki_update_announcement_only',note:'更新专题索引补充；剧情梗概和官方实装状态尚未独立核验'});
 }}
 // Store only index metadata, not the scraped page prose, task solutions or dialogue.
 const sourceMetadata=sources.map(({rows,...s})=>({...s,extractedIndexSha256:hash(JSON.stringify(items.filter(i=>i.sourceId===s.id)))}));
 writeFileSync(snapshotFile,JSON.stringify({schemaVersion:1,capturedOn:'2026-09-30',scope:'Public story outline index; not a dialogue corpus',license:'BWIKI contributors / CC BY-NC-SA 4.0; original game rights remain with their holders',sources:sourceMetadata,items},null,2));
}
if(!existsSync(snapshotFile))throw new Error('缺少 index-snapshot.json');
const snapshot=JSON.parse(readFileSync(snapshotFile,'utf8'));
const labels={archon:'魔神任务',story:'传说任务',tribal:'部族纪闻',hangout:'邀约角色入口',world:'世界任务与探索',commission:'NPC 委托', 'commission-combat':'非 NPC 委托',event:'活动剧情',anecdote:'游逸旅闻角色入口',moon:'伴月纪闻',npc:'NPC 名录'};
const counts=Object.fromEntries(Object.keys(labels).map(k=>[k,snapshot.items.filter(i=>i.kind===k).length]));
writeFileSync(join(dataDir,'coverage.json'),JSON.stringify({capturedOn:snapshot.capturedOn,indexEntries:snapshot.items.length,counts,sourceCount:snapshot.sources.length,unavailableSources:snapshot.sources.filter(s=>s.status!=='read').map(s=>s.title),catalogDialogueNodes:0,prototypeDialogueRecords:14,completeGameCoverage:false},null,2));
const esc=s=>String(s??'').replace(/\|/g,'\\|').replace(/\n/g,' ');
for(const[k,label]of Object.entries(labels)){
 const list=snapshot.items.filter(i=>i.kind===k);let md=`# ${label}目录\n\n整理日期：${snapshot.capturedOn}。共 ${list.length} 条索引记录；不是已核对的对白条数或唯一任务/人物数量。系列与子任务可能并列，同名人物及跨地区出现保留独立记录。对白均待逐条核对。\n\n[返回总提纲](./README.md) · [离线检索页](./catalog.html)\n\n`;
 for(const region of [...new Set(list.map(i=>k==='npc'?i.group:i.region))]){
  md+=`## ${region}\n\n| 名称 | 分组 / 章节 | 位置 / 系列 | 来源 |\n| --- | --- | --- | --- |\n`;
  for(const i of list.filter(i=>(k==='npc'?i.group:i.region)===region))md+=`| ${esc(i.title)} | ${esc(i.chapter||i.group)} | ${esc(i.location||i.series||'—')} | [索引](${i.sourceUrl}) · [检索条目](${i.lookupUrl}) |\n`;
  md+='\n';
 }
 writeFileSync(join(out,k+'.md'),md);
}
writeFileSync(join(out,'catalog-data.json'),JSON.stringify(snapshot));
const template=join(root,'scripts','story-catalog.template.html');
if(existsSync(template))writeFileSync(join(out,'catalog.html'),readFileSync(template,'utf8').replace('__CATALOG_DATA__',JSON.stringify(snapshot).replace(/</g,'\\u003c')).replace('__CATALOG_LABELS__',JSON.stringify(labels)));
console.log(JSON.stringify({entries:snapshot.items.length,counts,gaps:snapshot.sources.filter(s=>s.status!=='read').map(s=>s.title)},null,2));
