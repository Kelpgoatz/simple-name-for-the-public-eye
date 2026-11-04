const test=require('node:test');
const assert=require('node:assert/strict');
const {markers,shortLabel}=require('../fixture-slider.js');
test('long calendars keep five evenly spaced markers including both ends',()=>{const entries=Array.from({length:173},(_,value)=>({value,label:'Day '+value}));assert.deepEqual(markers(entries).map(e=>e.value),[0,43,86,129,172]);});
test('short calendars retain every round and empty calendars are safe',()=>{assert.deepEqual(markers([]),[]);assert.deepEqual(markers([{value:1},{value:2}]).map(e=>e.value),[1,2]);});
test('markers use round/week numbers and Sydney dates',()=>{assert.equal(shortLabel({label:'Round 12'}),'R12');assert.equal(shortLabel({label:'Week 9'}),'W9');assert.equal(shortLabel({label:'Date',date:'2026-11-04T23:00:00Z'}),'5 Nov');assert.equal(shortLabel({label:'Grand Final'}),'Final');});
