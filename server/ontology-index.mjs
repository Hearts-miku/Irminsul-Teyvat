import {createHash} from 'node:crypto';
export const normalizeName=s=>s.normalize('NFKC').replace(/^[\s「」『』《》“”]+|[\s「」『』《》“”]+$/g,'').replace(/\s+/g,' ').trim();
export const fingerprint=s=>createHash('sha256').update(JSON.stringify([s.path,s.text,s.origin??null])).digest('hex');
export function nameMatcher(entries){
 const root=new Map();
 for(const [name,ids] of entries){let node=root;for(const char of name){if(!node.has(char))node.set(char,new Map());node=node.get(char);}node.set(null,ids);}
 return text=>{const found=new Set(),chars=[...text.normalize('NFKC')];for(let i=0;i<chars.length;i++){let node=root;for(let j=i;j<chars.length&&node.has(chars[j]);j++){node=node.get(chars[j]);for(const id of node.get(null)??[])found.add(id);}}return [...found];};
}
export function classifyIntent(q){
 if(/倍率|配队|暴击|技能伤害|圣遗物.*效果/.test(q))return null;
 if(/关系|认识|关联|有关/.test(q))return 'relation';
 if(/属于|所属|成员|加入|组织/.test(q)&&!/什么组织/.test(q))return 'membership';
 if(/在哪|地点|位置|来自|哪里/.test(q))return 'location';
 if(/为什么|目的|目标|原因|动机/.test(q))return 'purpose';
 if(/经历|历史|发生|后来|先后/.test(q))return 'history';
 if(/是谁|是什么|什么是|介绍|讲讲|来历|来头|了解|什么组织/.test(q))return 'definition';
 return null;
}
