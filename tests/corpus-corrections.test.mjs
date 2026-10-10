import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyCorpusCorrections} from '../scripts/lib/corpus-corrections.mjs';
import {parseCorpusText} from '../scripts/lib/corpus-text.mjs';
test('源码校正绑定修订与哈希，定位不唯一拒绝修改，原始对象不变',()=>{
 const page={pageid:1,revision:2,sha256:'x',wikitext:'甲缺乙'},patch={...page,id:'p',find:'缺',replace:'补',reason:'测试',evidence:[]};
 assert.equal(applyCorpusCorrections(page,[patch]).text,'甲补乙');assert.equal(page.wikitext,'甲缺乙');
 assert.deepEqual(applyCorpusCorrections({...page,revision:3},[patch]).stale,['p']);
 assert.deepEqual(applyCorpusCorrections({...page,sha256:'y'},[patch]).stale,['p']);
 assert.throws(()=>applyCorpusCorrections({...page,wikitext:'缺缺'},[patch]),/不唯一/);
});
test('两个真实损坏页恢复模板结构且仅插入闭合符',()=>{
 const patches=JSON.parse(readFileSync('data/corpus-corrections.json'));
 for(const id of [46291,167402]){const raw=JSON.parse(readFileSync(`tests/fixtures/corpus/${id}.json`)),result=applyCorpusCorrections(raw,patches);assert.equal(result.applied.length,1);assert.equal(result.text.replaceAll('}}',''),raw.wikitext.replaceAll('}}',''));assert.equal(parseCorpusText(result.text,{pageTitle:raw.title}).malformed,false);}
});
test('折叠条件与分页对白保持分离，结束后条件不泄漏',()=>{
 const result=parseCorpusText('{{折叠框|开始|标题=任务前}}甲：等等。{{折叠框|结束}}\n甲：你好。\n{{折叠面板|开始}}{{折叠面板|内容开始|标题=任务后}}乙：谢谢。{{折叠面板|内容结束}}{{折叠面板|结束}}\n{{#tag:tabber|空=甲：哥哥。{{!}}-{{!}}荧=甲：妹妹。}}');
 const find=s=>result.sections.find(x=>x.text.includes(s));assert.ok(find('等等').path.includes('任务前'));assert.ok(!find('你好').path.includes('任务前'));assert.ok(find('谢谢').path.includes('任务后'));assert.ok(find('哥哥').path.includes('分页：空'));assert.ok(find('妹妹').path.includes('分页：荧'));assert.deepEqual(result.unresolvedTemplates,[]);
});
test('常用模板保留任务描述、注音、隐藏文字和静态时间标记',()=>{
 const r=parseCorpusText('{{任务描述|寻找{{NPC图标|type=赠礼|苹果|2}}。|蒙德}}\n甲：{{黑幕|秘密|色号=black}}，{{下注音|旅人|客人|原语言=zh|注音语言=zh}}。\n{{提示|蓝色|提示内容}}\n{{计时|2025|1|2|显示时间=活动日期}}');
 assert.ok(r.sections.some(s=>s.text.includes('寻找苹果 × 2')&&s.path.includes('任务描述')));assert.ok(r.sections.some(s=>s.text.includes('隐藏文字：秘密')&&s.text.includes('旅人〔注音：客人〕')));assert.ok(r.sections.some(s=>s.text.includes('不代表当前活动状态')));assert.deepEqual(r.unresolvedTemplates,[]);
});

test('注音参数、彩蛋折叠与无效标志修订绑定修正，不误删除对白',()=>{const patches=JSON.parse(readFileSync('data/corpus-corrections.json'));for(const id of [127261,163922,10964]){const p=JSON.parse(readFileSync('tests/fixtures/corpus/'+id+'.json')),fixed=applyCorpusCorrections(p,patches),r=parseCorpusText(fixed.text);assert.equal(fixed.applied.length,1);assert.deepEqual(r.unresolvedTemplates,[]);assert.equal(applyCorpusCorrections({...p,revision:p.revision+1},patches).applied.length,0);if(id===163922){assert.ok(r.sections.some(s=>s.text.includes('玫瑰')&&!s.path.includes('誓言岬对话彩蛋')));}if(id===10964)assert.ok(r.sections.some(s=>s.text.includes('打牌的技术')));}});
