// A conservative local wikitext reader, not a MediaWiki renderer. Unknown macros
// remain visible and are reported; option labels stay attached to their branches.
export function splitWiki(value,separator='|'){
 const parts=[];let start=0,braces=0,links=0;
 for(let i=0;i<value.length;i++){
  const pair=value.slice(i,i+2);
  if(pair==='{{'){braces++;i++;}else if(pair==='}}'&&braces){braces--;i++;}
  else if(pair==='[['){links++;i++;}else if(pair===']]'&&links){links--;i++;}
  else if(value[i]===separator&&!braces&&!links){parts.push(value.slice(start,i));start=i+1;}
 }
 parts.push(value.slice(start));return parts;
}
export function plainWiki(value){
 return value.replace(/<!--[\s\S]*?-->/g,'').replace(/\[\[(?:file|image|文件|图像|分类|category):[^\]]*\]\]/gi,'')
  .replace(/\[\[([^\]]+)\]\]/g,(_,s)=>s.split('|').at(-1)).replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g,'$1')
  .replace(/<\/?(?:br|p|div|tr|li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/'{2,5}/g,'')
  .replace(/&(?:nbsp|amp|lt|gt|quot);/g,s=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"'}[s]))
  .replace(/&#(x[\da-f]+|\d+);/gi,(_,s)=>{const n=s[0].toLowerCase()==='x'?parseInt(s.slice(1),16):+s;return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';})
  .replace(/^[=*#;: ]+(?=\S)/gm,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
const skipField=/图片|立绘|地图|坐标|奖励|经验|摩拉|原石|成就|道具|书籍|素材|语音文件|CV|声优|最后编辑|是否完善|攻略视频|相关视频|导航|编号|存在商店|存在成就|存在书籍|存在道具|^折叠$|^颜色$|^样式$|^选项\d+图标$|^默认选项$/;
const skipTemplate=/^(?:导航|面包屑|视频|B站|YouTube|图标|奖励|任务奖励|NPC位置|原神地图|地图|成就|道具|图片|文件|攻略组|施工|目录|TOC)/i;
export function parseCorpusText(wikitext,{pageTitle='',resolveReference,resolveIndex,referenceChain=[]}={}){
 const sections=[],unresolved=new Set(),warnings=new Set();let malformed=false;
 const fieldsOf=parts=>{let positional=0;const fields=new Map();for(const part of parts){const eq=splitWiki(part,'='),field=eq.length>1?{name:eq.shift().trim(),value:eq.join('=')}:{name:String(++positional),value:part};fields.set(field.name,field);}return [...fields.values()];};
 // Only flatten known inline presentation templates. Unknown structures stay explicit.
 function inlineValue(value,depth=0){
  if(depth>40)return undefined;
  let result='',cursor=0;
  while(cursor<value.length){const start=value.indexOf('{{',cursor);if(start<0)return result+value.slice(cursor);result+=value.slice(cursor,start);let balance=1,end=start+2;
   for(;end<value.length&&balance;end++){if(value.slice(end,end+2)==='{{'){balance++;end++;}else if(value.slice(end,end+2)==='}}'){balance--;end++;}}
   if(balance)return undefined;const parts=splitWiki(value.slice(start+2,end-2)),name=parts.shift().trim(),text=inlineTemplate(name,parts,depth+1);if(text===undefined)return undefined;result+=text;cursor=end;
  }return result;
 }
 function inlineTemplate(name,parts,depth=0){
  if(name.startsWith('#info:')&&fieldsOf(parts).every(f=>['1','max-width','theme'].includes(f.name))){const v=inlineValue(name.slice(6),depth+1);return v===undefined?undefined:'〔来源注释：'+v+'〕';}
  if(!parts.length){if(name==='PAGENAME'&&pageTitle)return pageTitle;if(name==='!')return '|';if(/^(?:玩家|旅行者|主角|空|荧)$/.test(name))return '【'+name+'】';if(name.startsWith('#info:')){const v=inlineValue(name.slice(6),depth+1);return v===undefined?undefined:'〔注释：'+v+'〕';}return undefined;}
  const fields=fieldsOf(parts),get=n=>fields.find(f=>f.name===String(n))?.value;
  if(name==='背景'&&fields.every(f=>['1','2'].includes(f.name)))return inlineValue(get(2)||get(1)||'',depth+1);
  if(/^key$/i.test(name)&&fields.every(f=>['1','2'].includes(f.name))){const key=inlineValue(get(1)??'',depth+1);return key===undefined?undefined:'〔按键：'+key+'〕';}
  if(name==='颜色'&&fields.every(f=>['1','2'].includes(f.name))&&get(1)!=='描述'&&get(2)!==undefined)return inlineValue(get(2),depth+1);
  if(/^(?:注音|下注音)$/.test(name)&&fields.every(f=>['1','2','原语言','注音语言','注音字号'].includes(f.name))&&get(1)!==undefined&&get(2)!==undefined){const base=inlineValue(get(1),depth+1),note=inlineValue(get(2),depth+1);if(base!==undefined&&note!==undefined)return base+'〔注音：'+note+'〕';}
  if(name==='黑幕'&&fields.every(f=>['1','色号'].includes(f.name))&&get(1)!==undefined){const v=inlineValue(get(1),depth+1);return v===undefined?undefined:'〔隐藏文字：'+v+'〕';}
  if(name==='NPC图标'&&fields.every(f=>['1','2','type','图标修正','link'].includes(f.name))&&get(1)!==undefined){const item=inlineValue(get(1),depth+1),n=get(2)===undefined?'':inlineValue(get(2),depth+1);if(item!==undefined&&n!==undefined)return item+(n?' × '+n:'');}
  return undefined;
 }
 const emit=(text,path)=>{
  text=plainWiki(text);if(!text||!/[\p{L}\p{N}]/u.test(text))return;
  // Preserve context on every fragment; never imply fragment boundaries are game dialogue IDs.
  const lines=text.split(/\n+/);let chunk='';
  const flush=()=>{if(chunk.trim())sections.push({path:[...path],text:chunk.trim()});chunk='';};
  for(const line of lines){if(chunk.length+line.length>1400)flush();for(let i=0;i<line.length;i+=1400){const part=line.slice(i,i+1400);if(chunk.length+part.length>1400)flush();chunk+=(chunk?'\n':'')+part;}}flush();
 };
 function walk(value,path=[],depth=0){
  if(depth>40){unresolved.add('嵌套超过40层');emit(value,path);return;}
  let cursor=0,heading=[],pending='',optionGroup=0;const frames=[];
  const current=()=>[...path,...heading.filter(Boolean),...frames.map(f=>f.title).filter(Boolean)];
  const write=fragment=>{let start=0;for(const m of fragment.matchAll(/^(={2,6})\s*(.*?)\s*\1\s*$/gm)){emit(fragment.slice(start,m.index),current());const level=m[1].length-2;heading.length=level;heading[level]=plainWiki(m[2]);start=m.index+m[0].length;}emit(fragment.slice(start),current());};
  while(cursor<value.length){
   const start=value.indexOf('{{',cursor);if(start<0){write(pending+value.slice(cursor));pending='';break;}
   pending+=value.slice(cursor,start);let balance=1,end=start+2;
   for(;end<value.length&&balance;end++){if(value.slice(end,end+2)==='{{'){balance++;end++;}else if(value.slice(end,end+2)==='}}'){balance--;end++;}}
   if(balance){write(pending);pending='';malformed=true;emit(value.slice(start),[...current(),'未闭合模板']);break;}
   const parts=splitWiki(value.slice(start+2,end-2)),name=parts.shift().trim();cursor=end;
   const inline=inlineTemplate(name,parts);if(inline!==undefined){pending+=inline;continue;}
   write(pending);pending='';
   if(skipTemplate.test(name))continue;
   const fields=fieldsOf(parts),get=n=>fields.find(f=>f.name===String(n))?.value;
   if(['JS','Anchor','左侧目录','嵌入地图'].includes(name)||name.startsWith('#css:'))continue;
   if(name==='背景'&&fields.every(f=>['1','2'].includes(f.name))){walk(get(2)||get(1)||'',current(),depth+1);continue;}
   if(name==='对局信息'){
    const conditions={'关卡介绍':'关卡介绍','进入对局':'进入对局','元素爆发':'对手使用元素爆发','我方阵亡':'玩家角色牌被击倒1人','阵亡一人':'对手角色牌被击倒1人','阵亡两人':'对手角色牌被击倒2人'};
    for(const f of fields){if(conditions[f.name])walk(f.value,[...current(),'七圣召唤',plainWiki(get('对局类型')??''),plainWiki(get('角色')??''),conditions[f.name]].filter(Boolean),depth+1);else if(!['角色','对局类型','我方牌组','我方卡牌','对手阵容'].includes(f.name)){unresolved.add(name+'：'+f.name);walk(f.value,[...current(),'对局待确认字段',f.name],depth+1);}}continue;
   }
   if(['待补充','需要帮助'].includes(name)||['NPC对话','NPC剧情'].includes(name)&&!parts.length){warnings.add('来源内容缺失：'+name);emit('【来源内容缺失：'+name+'】',[...current(),'来源提示']);for(const f of fields)walk(f.value,[...current(),'编者留言'],depth+1);continue;}
   if(name==='注释'){for(const f of fields)walk(f.value,[...current(),'来源注释'],depth+1);continue;}
   if(name.startsWith('#section-h:')||name.startsWith(':')||name.startsWith('#show:')){
    const field=name.startsWith('#show:')?get(1)?.slice(1):undefined;
    const title=name.startsWith('#show:')?name.slice(6):name.startsWith(':')?name.slice(1):name.slice(11),section=name.startsWith(':')||field?undefined:get(1),key=title+'#'+(field??section??'');
    const safeArgs=name.startsWith('#show:')?fields.length===1&&/^\?卷[1-9]\d*内容$/.test(get(1)??''):name.startsWith(':')?!parts.length:fields.every(f=>f.name==='1'||f.name==='2'&&!f.value.trim());
    const ref=safeArgs&&referenceChain.length<8&&!referenceChain.includes(key)?resolveReference?.(title,section,field):null;
    if(ref){const child=parseCorpusText(ref.text,{pageTitle,resolveReference,resolveIndex,referenceChain:[...referenceChain,key]});for(const s of child.sections)sections.push({...s,path:[...current(),'引用页：'+title,...s.path],origin:s.origin??ref.origin});for(const u of child.unresolvedTemplates)unresolved.add(u);for(const warning of child.sourceWarnings)warnings.add(warning);if(child.malformed){warnings.add('引用页未闭合模板：'+title);malformed=true;}continue;}
   }
   if(['邀约事件','活动系列任务','人物出场'].includes(name)){
    const characterIndex=name==='人物出场',kind=characterIndex?(get(2)==='活动'?'character-activities':'character-tasks'):'series';
    const value=plainWiki(inlineValue(characterIndex?get(1)??'':get(name==='邀约事件'?'名称':'系列任务名')||pageTitle)??'');
    const supported=characterIndex?fields.every(f=>['1','2'].includes(f.name))&&['任务','活动'].includes(get(2)):true;
    const result=supported?resolveIndex?.(kind,value):null;
    if(result){if(result.queriedAt)warnings.add('活动出场索引查询于 '+result.queriedAt+'，只覆盖来源非剧情活动分类');warnings.add('动态目录仅列已缓存且字段明确匹配的条目，不代表完整列表：'+name);if(!result.rows.length)emit(kind==='character-activities'?'【本次非剧情活动索引未返回相关条目，不代表没有历史出场】':'【关联目录暂无本地匹配，不代表没有相关任务】',[...current(),'关联目录（非对白）']);for(const row of result.rows)sections.push({path:[...current(),'关联目录（非对白）',value,row.title],text:'【仅列本地已缓存关联，不代表完整列表】\n'+row.text,origin:row.origin});}
    else{unresolved.add(name+(characterIndex&&get(2)==='活动'?'：活动目录未采集':''));emit('【关联目录未展开：'+name+'】',[...current(),'来源提示']);}
    if(characterIndex)continue;
    const allowed=name==='邀约事件'?/^(?:名称|角色|所属版本|任务地区|系列任务|存在道具|存在书籍|结局奖励[1-6])$/:/^(?:系列任务名|副标题|重要任务|专属角色|任务地区|所属版本|描述2?|存在道具|相关活动|任务类型|存在成就|存在书籍|存在头像|活动任务)$/;
    for(const f of fields){if(name==='邀约事件'&&f.name==='第一幕'){warnings.add('来源模板未使用参数：邀约事件/第一幕；保留原参数，不据此推断顺序');walk(f.value,[...current(),'来源未使用参数（非剧情事实）',f.name],depth+1);continue;}if(!allowed.test(f.name))unresolved.add(name+'：'+f.name);if(!skipField.test(f.name))walk(f.value,[...current(),f.name],depth+1);}continue;
   }
   if(name.startsWith('DISPLAYTITLE:')){emit(name.slice(13),[...current(),'来源显示标题']);continue;}
   if(name==='相册'&&fields.every(f=>['1','2'].includes(f.name))){for(const f of fields)walk(f.value,[...current(),'相册',f.name==='1'?'标题':'说明'],depth+1);continue;}
   if(name==='多义词'){
    for(const f of fields){if(/^分隔符\d*$/.test(f.name))continue;walk(f.value,[...current(),'同名条目说明（非剧情事实）',f.name],depth+1);}continue;
   }
   if(/^(?:模板:)?角色\/幻想真境剧诗$/.test(name)){
    warnings.add('来源未注明三组对话的具体触发条件；不推断发生顺序。');
    for(let n=1;n<=3;n++)for(const part of ['a','b','c']){const key='对话'+n+part,value=get(key);if(value?.trim())walk(value,[...current(),'幻想真境剧诗','对话组 '+n,'行 '+part,'说话人：'+plainWiki(get(key+'角色')||get('角色')||'未标注')],depth+1);}
    for(const f of fields)if(!/^(?:角色|表演诀窍|对话[123][abc](?:角色)?)$/.test(f.name)){unresolved.add(name+'：'+f.name);walk(f.value,[...current(),'待确认字段',f.name],depth+1);}continue;
   }
   if(name==='NPC/七圣召唤'){
    const conditions={'介绍':'关卡介绍','前置对话':'开始挑战前','胜利':'玩家胜利后','失败':'玩家失败后','我方阵亡':'玩家角色牌被击倒','阵亡一人':'对手角色牌被击倒1人','阵亡两人':'对手角色牌被击倒2人','元素爆发':'对手使用元素爆发'};
    for(const f of fields){if(conditions[f.name])walk(f.value,[...current(),'七圣召唤',plainWiki(get('类型')??''),plainWiki(get('标题')??''),conditions[f.name]].filter(Boolean),depth+1);else if(!/^(?:类型|标题|阵容|初始阵容|候补阵容|对话|目标\d+|奖励\d+|通关奖励)$/.test(f.name)){unresolved.add(name+'：'+f.name);walk(f.value,[...current(),'七圣召唤待确认字段',f.name],depth+1);}}continue;
   }
   if(name==='切换板'){
    const action=get(1);if(action==='开始'){frames.push({type:'切换板组',title:'',labels:[],next:0});continue;}
    const group=frames.findLast(f=>f.type==='切换板组');
    if(group&&['默认显示','默认折叠'].includes(action)){group.labels.push(plainWiki(get(2)??'未命名分页'));continue;}
    if(group&&['显示内容','折叠内容'].includes(action)){const title=group.labels[group.next++];if(!title)unresolved.add('切换板：分页标题缺失');frames.push({type:'切换板内容',title:'分页：'+(title??'待确认')});continue;}
    if(group&&action==='内容结束'&&frames.at(-1)?.type==='切换板内容'){frames.pop();continue;}
    if(group&&action==='结束'){if(group.next!==group.labels.length)unresolved.add('切换板：分页数量不匹配');frames.splice(frames.lastIndexOf(group));continue;}
   }
   if(name==='折叠框'||name==='折叠面板'){
    const action=get(1)??(name==='折叠面板'?'内容开始':'');
    if(get('内容')!==undefined){walk(get('内容'),[...current(),plainWiki(get('标题')??'折叠内容')],depth+1);continue;}
    const frameType=name+(action.startsWith('内容')?'内容':'组');
    if(action==='开始'||action==='内容开始'){frames.push({type:frameType,title:plainWiki(get('标题')??'')});continue;}
    if(action==='结束'||action==='内容结束'){const i=frames.findLastIndex(f=>f.type===frameType);if(i>=0)frames.splice(i);else unresolved.add(name+'：闭合顺序待核对');continue;}
   }
   if(name==='#tag:tabber'){
    const body=parts.join('|').replace(/\{\{!\}\}/g,'|'),tabs=splitWiki(body);let slot='';
    for(const tab of tabs){if(tab.trim()==='-')continue;const eq=splitWiki(tab,'=');if(eq.length>1){slot=plainWiki(eq.shift());walk(eq.join('='),[...current(),'分页：'+slot],depth+1);}else if(tab.trim()){unresolved.add('#tag:tabber：未识别分页');walk(tab,[...current(),'分页：'+(slot||'待确认')],depth+1);}}continue;
   }
   if(name==='任务描述'){if(get(1))walk(get(1),[...current(),'任务描述'],depth+1);if(get(2))walk(get(2),[...current(),'任务地点'],depth+1);for(const f of fields.filter(f=>!['1','2'].includes(f.name))){unresolved.add(name+'：'+f.name);walk(f.value,[...current(),f.name],depth+1);}continue;}
   if(name==='提示'||name==='提示消息'){if(get(3)&&name==='提示')walk(get(3),[...current(),'提示标题'],depth+1);if(get(2))walk(get(2),[...current(),'来源提示'],depth+1);continue;}
   if(name==='计时'&&get(1)&&get(2)&&get(3)){
    emit('〔来源时间标记：'+[get(1),get(2),get(3)].join('-')+' '+[get(4)??'0',get(5)??'0',get(6)??'0'].join(':')+'；不代表当前活动状态〕',current());if(get('显示时间'))walk(get('显示时间'),[...current(),'时间显示说明'],depth+1);continue;
   }
   if(!/^(?:任务|传说任务|NPC|NPC对话|NPC剧情|剧情选项|剧情|折叠|颜色|系列任务|多重系列任务|人物对话)$/.test(name))unresolved.add(name);
   if(!parts.length){if(/^(?:玩家|旅行者|主角|PAGENAME|空|荧)$/.test(name))emit('【'+name+'】',current());else{unresolved.add(name);emit('【未展开模板：'+name+'】',current());}continue;}
   if(name==='人物对话'){
    const speaker=fields.find(f=>f.name==='2')?.value,body=fields.find(f=>f.name==='3')?.value;
    if(speaker&&body!==undefined){const who=plainWiki(inlineValue(speaker)??speaker);const dialoguePath=[...current(),'说话人：'+who];const rendered=inlineValue(body);if(rendered!==undefined)emit(who+'：'+rendered,dialoguePath);else walk(body,dialoguePath,depth+1);
     for(const f of fields.filter(f=>!['1','2','3'].includes(f.name)))walk(f.value,[...dialoguePath,'附注 '+f.name],depth+1);continue;}
    unresolved.add(name);
   }
   if(name==='颜色'){walk(fields.at(-1)?.value??'',[...current(),'场景说明'],depth+1);continue;}
   const title=fields.find(f=>f.name==='标题')?.value;const nextPath=[...current(),...(title?[plainWiki(title)]:[]),...(/^(?:NPC剧情|剧情选项)$/.test(name)?['源码选项组 '+(++optionGroup)]:[])];
   for(const f of fields){
    if(skipField.test(f.name)||f.name==='标题')continue;
    const option=f.name.match(/^(?:剧情|内容|分支)(\d+)$/)?.[1];
    const label=option?fields.find(x=>x.name==='选项'+option)?.value:null;
    const context=label?'选项 '+option+'：'+plainWiki(inlineValue(label)??label):/^\d+$/.test(f.name)?name+' 参数 '+f.name:f.name;
    walk(f.value,[...nextPath,context],depth+1);
   }
  }
  if(pending)write(pending);
  for(const frame of frames)unresolved.add(frame.type+'：未闭合分组');
 }
 walk(wikitext.replace(/<!--[\s\S]*?-->/g,''));
 return {sections,unresolvedTemplates:[...unresolved],sourceWarnings:[...warnings],malformed};
}
