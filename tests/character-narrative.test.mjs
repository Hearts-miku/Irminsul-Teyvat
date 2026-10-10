import test from 'node:test';import assert from 'node:assert/strict';
import {parseCharacterNarrative} from '../scripts/lib/character-narrative.mjs';
test('角色故事单独入库，保留条件与嵌套文本，不泄漏效果数值',()=>{
 const r=parseCharacterNarrative('{{角色|攻击力=999}}{{角色/故事|角色详细=介绍|角色故事1=甲{{颜色|蓝|乙}}|角色故事1解锁条件=完成某任务|冒险笔记名称=信件|冒险笔记=正文}}{{天赋技能|伤害=1000}}');
 assert.ok(r.sections.some(s=>s.text==='甲乙'&&s.path.includes('解锁条件：完成某任务')));
 assert.ok(r.sections.some(s=>s.path.includes('信件')));assert.ok(!JSON.stringify(r).includes('999'));assert.ok(!JSON.stringify(r).includes('1000'));assert.deepEqual(r.unresolvedTemplates,[]);
 assert.ok(parseCharacterNarrative('{{角色/故事|角色故事1=}}').sourceWarnings[0].startsWith('来源内容缺失'));
 assert.throws(()=>parseCharacterNarrative('{{角色/故事|角色故事1=甲|角色故事1=乙}}'));
 assert.throws(()=>parseCharacterNarrative('{{角色/故事|角色故事1=甲'));
});
