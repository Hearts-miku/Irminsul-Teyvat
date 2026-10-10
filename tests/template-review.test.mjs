import test from 'node:test';import assert from 'node:assert/strict';import {parseCorpusText} from '../scripts/lib/corpus-text.mjs';
import {referenceResolver,selectSection} from '../scripts/lib/transclusions.mjs';
test('跨页引用只展开指定章节，保留真正出处且防止循环',()=>{
 const target={pageid:7,title:'原页',revision:8,sha256:'x',wikitext:'==任务前==\n甲：开始。\n===分支===\n甲：选择。\n==任务后==\n甲：结局。'},resolveReference=referenceResolver([target,{pageid:9,title:'循环',wikitext:'{{:循环}}'}]);
 const r=parseCorpusText('==当前场景==\n{{#section-h:原页|任务前}}',{resolveReference});assert.ok(r.sections.length);assert.ok(r.sections.every(s=>s.origin.pageid===7&&s.origin.revision===8));assert.ok(!r.sections.some(s=>s.text.includes('结局')));assert.equal(selectSection(target.wikitext,'不存在'),null);assert.equal(selectSection('==重复==\n甲\n==重复==\n乙','重复'),null);assert.ok(parseCorpusText('{{:循环}}',{resolveReference}).unresolvedTemplates.includes(':循环'));
});
test('源站空对白和待补充是内容缺口，不能伪装成模板错误或已补完',()=>{
 const r=parseCorpusText('{{NPC对话}}{{待补充|缺少任务后的台词}}');assert.equal(r.sourceWarnings.length,2);assert.deepEqual(r.unresolvedTemplates,[]);assert.ok(r.sections.some(s=>s.text.includes('缺少任务后的台词')));
});
test('同一场景反复出现同一句选项时保留两次，且不同组选项不混同',()=>{
 const r=parseCorpusText('==交谈==\n{{NPC剧情|选项1=继续|选项1图标=Talk|默认选项=1|剧情1=甲：第一次。}}\n甲：想好了？\n{{NPC剧情|选项1=继续|剧情1=甲：第二次。}}');const choices=r.sections.filter(s=>s.text==='继续');assert.equal(choices.length,2);assert.notDeepEqual(choices[0].path,choices[1].path);assert.ok(r.sections.some(s=>s.text==='甲：第一次。'));assert.ok(r.sections.some(s=>s.text==='甲：第二次。'));assert.ok(!r.sections.some(s=>s.text==='Talk'||s.text==='1'));
});
test('注释条件属于对应选项，图标类型不能当作对白',()=>{
 const r=parseCorpusText('{{NPC剧情|选项1=关于过去{{#info:完成[[任务甲]]后出现|info|max-width=300}}|剧情1=甲：过去的事。|选项2=再见|剧情2=甲：再见。}}');
 assert.ok(r.sections.find(s=>s.text==='甲：过去的事。').path.some(x=>x.includes('完成任务甲后出现')));assert.ok(!r.sections.find(s=>s.text==='甲：再见。').path.some(x=>x.includes('任务甲')));assert.ok(!r.sections.some(s=>s.text==='info'));assert.deepEqual(r.unresolvedTemplates,[]);
});
test('七圣召唤胜负是玩家视角，战斗触发对白不混入另一条件',()=>{
 const r=parseCorpusText('{{NPC/七圣召唤|类型=冒险挑战|标题=切磋|胜利=甲：我输了。|失败=甲：我赢了。|我方阵亡=可惜。|元素爆发=看招！|奖励1=原石}}');
 assert.ok(r.sections.find(s=>s.text==='甲：我输了。').path.includes('玩家胜利后'));assert.ok(r.sections.find(s=>s.text==='甲：我赢了。').path.includes('玩家失败后'));assert.ok(r.sections.find(s=>s.text==='可惜。').path.includes('玩家角色牌被击倒'));assert.ok(r.sections.find(s=>s.text==='看招！').path.includes('对手使用元素爆发'));assert.deepEqual(r.unresolvedTemplates,[]);
});
test('切换板的标题依序分配，结束后不向后泄漏',()=>{
 const r=parseCorpusText('{{切换板|开始}}{{切换板|默认显示|任务前}}{{切换板|默认折叠|任务后}}{{切换板|显示内容}}甲：等等。{{切换板|内容结束}}{{切换板|折叠内容}}甲：好了。{{切换板|内容结束}}{{切换板|结束}}甲：再见。');
 assert.deepEqual(r.sections.map(s=>s.path),[['分页：任务前'],['分页：任务后'],[]]);assert.deepEqual(r.unresolvedTemplates,[]);
});

test('剧诗三组对白保留说话人和分组，不虚构触发条件',()=>{const r=parseCorpusText('{{模板:角色/幻想真境剧诗|角色=丽莎|对话1a=休息一下。|对话2a=继续前进。|对话2a角色=旅行者|对话3a=看看书。|表演诀窍=动作}}');assert.equal(r.sections.length,3);assert.ok(r.sections[0].path.includes('对话组 1'));assert.ok(r.sections[1].path.includes('说话人：旅行者'));assert.ok(r.sections[2].path.includes('对话组 3'));assert.ok(r.sourceWarnings.some(s=>s.includes('触发条件')));assert.deepEqual(r.unresolvedTemplates,[]);});

test('对局信息区分玩家与对手触发，嵌套背景保留场景而不输出样式',()=>{const r=parseCorpusText('{{#css:.x{color:red}}}{{背景|白|{{颜色|描述|教学开始}}}}{{对局信息|角色=一斗|对局类型=挑战|我方阵亡=轮到我了|阵亡一人=还没结束|元素爆发=接招|对手阵容=卡牌|我方牌组=卡组}}');assert.deepEqual(r.unresolvedTemplates,[]);assert.ok(r.sections.some(s=>s.text==='教学开始'&&s.path.includes('场景说明')));assert.ok(r.sections.some(s=>s.text==='轮到我了'&&s.path.includes('玩家角色牌被击倒1人')));assert.ok(r.sections.some(s=>s.text==='还没结束'&&s.path.includes('对手角色牌被击倒1人')));assert.ok(r.sections.every(s=>!s.text.includes('color:red')&&!s.text.includes('卡牌')));assert.ok(parseCorpusText('{{对局信息|未知条件=保留}}').unresolvedTemplates.includes('对局信息：未知条件'));});

test('书籍字段引用只读取指定卷正文并保留独立出处，拒绝任意属性与重复字段',()=>{const p={pageid:5,title:'书甲',revision:6,sha256:'x',wikitext:'{{书籍|卷1内容=正文{{颜色|蓝|甲}}|卷2内容=不可泄漏}}'},resolveReference=referenceResolver([p]);const r=parseCorpusText('{{#show:书甲|?卷1内容}}',{resolveReference});assert.equal(r.sections[0].text,'正文甲');assert.equal(r.sections[0].origin.pageid,5);assert.equal(r.sections[0].origin.section,'书籍字段：卷1内容');assert.ok(!r.sections.some(s=>s.text.includes('不可泄漏')));assert.ok(parseCorpusText('{{#show:书甲|?未知属性}}',{resolveReference}).unresolvedTemplates.length);const dup=referenceResolver([{...p,wikitext:'{{书籍|卷1内容=甲|卷1内容=乙}}'}]);assert.ok(parseCorpusText('{{#show:书甲|?卷1内容}}',{resolveReference:dup}).unresolvedTemplates.length);});

test('动态目录按明确字段关联，部分缓存不冒充完整出场史或对白',async()=>{const{dynamicIndexResolver}=await import('../scripts/lib/dynamic-index.mjs');const source={pageid:1,title:'甲任务',revision:2,sha256:'x',categories:['分类:任务'],wikitext:'{{任务\n|出场人物=甲、乙\n}}'},series={pageid:2,title:'第一幕',revision:3,sha256:'y',categories:['分类:系列任务'],wikitext:'{{系列任务\n|系列任务=邀约事件·甲\n|描述=任务介绍\n}}'},wrong={...source,pageid:3,title:'同名提及',wikitext:'{{任务|出场人物=甲乙}}正文提到甲'};const resolveIndex=dynamicIndexResolver([source,series,wrong]);const r=parseCorpusText('{{人物出场|{{PAGENAME}}|任务}}{{人物出场|甲|活动}}',{pageTitle:'甲',resolveIndex});assert.equal(r.sections.filter(s=>s.origin).length,1);assert.equal(r.sections.find(s=>s.origin).origin.pageid,1);assert.ok(r.sections.find(s=>s.origin).path.includes('关联目录（非对白）'));assert.ok(r.sourceWarnings.some(s=>s.includes('不代表完整列表')));assert.ok(r.unresolvedTemplates.includes('人物出场：活动目录未采集'));const h=parseCorpusText('{{邀约事件|名称=邀约事件·甲|角色=甲}}',{resolveIndex});assert.equal(h.sections.find(s=>s.origin).origin.pageid,2);assert.deepEqual(h.unresolvedTemplates,[]);assert.equal(resolveIndex('series','其他').rows.length,0);});

test('活动索引绑定来源修订，空结果限定查询范围，来源变化后重新标缺失',async()=>{const{dynamicIndexResolver}=await import('../scripts/lib/dynamic-index.mjs');const page={pageid:8,title:'活动甲',revision:9,sha256:'raw',wikitext:'{{活动|出场人物=甲}}',categories:['分类:活动']},index={capturedAt:'2026-10-04',characters:{甲:[{pageid:8,revision:9,sha256:'raw'}],乙:[]}};const resolveIndex=dynamicIndexResolver([],{activityIndex:index,activitySources:[page]});const r=parseCorpusText('{{人物出场|甲|活动}}',{resolveIndex});assert.equal(r.sections[0].origin.pageid,8);assert.match(r.sections[0].text,/不代表完整列表/);assert.deepEqual(r.unresolvedTemplates,[]);const empty=parseCorpusText('{{人物出场|乙|活动}}',{resolveIndex});assert.match(empty.sections[0].text,/不代表没有历史出场/);assert.deepEqual(empty.unresolvedTemplates,[]);const stale=dynamicIndexResolver([],{activityIndex:index,activitySources:[{...page,revision:10}]});assert.ok(parseCorpusText('{{人物出场|甲|活动}}',{resolveIndex:stale}).unresolvedTemplates.length);assert.ok(parseCorpusText('{{人物出场|丙|活动}}',{resolveIndex}).unresolvedTemplates.length);});
