import test from 'node:test';import assert from 'node:assert/strict';
import {digest} from '../scripts/lib/story-sources.mjs';
import {reviewedDuplicate} from '../scripts/lib/duplicate-reviews.mjs';
test('重复保留决定在来源或片段位置改变后失效',()=>{
 const p={pageid:1,revision:2,sha256:'source'},d={text:'对白',occurrences:[{fragment:1,path:['甲']},{fragment:2,path:['甲']}]};
 const r={...p,textHash:digest(d.text),occurrencesHash:digest(JSON.stringify(d.occurrences)),decision:'preserve'};
 assert.equal(reviewedDuplicate(d,p,[r]),r);
 assert.equal(reviewedDuplicate(d,{...p,revision:3},[r]),undefined);
 assert.equal(reviewedDuplicate(d,{...p,sha256:'changed'},[r]),undefined);
 assert.equal(reviewedDuplicate({...d,text:'新对白'},p,[r]),undefined);
 assert.equal(reviewedDuplicate({...d,occurrences:d.occurrences.slice(1)},p,[r]),undefined);
});
