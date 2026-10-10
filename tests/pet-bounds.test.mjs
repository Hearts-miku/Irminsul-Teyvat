import test from 'node:test';
import assert from 'node:assert/strict';
import {petBounds} from '../electron/pet-bounds.mjs';
test('pet panel anchors bottom right and round trips',()=>{const b={x:1000,y:700,width:240,height:260},a={x:0,y:0,width:1920,height:1080};const expanded=petBounds(b,a,true);assert.deepEqual(expanded,{x:800,y:240,width:440,height:720});assert.deepEqual(petBounds(expanded,a,false),b);});
test('pet panel clamps negative monitor and small work area',()=>{const a={x:-320,y:0,width:320,height:500};assert.deepEqual(petBounds({x:-100,y:100,width:240,height:260},a,true),{x:-320,y:0,width:320,height:500});});
