const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../viewer-favourites.js'),'utf8');
function setup(blocked=false){const values=new Map(),events=[];const context={module:{exports:{}},localStorage:{getItem:key=>{if(blocked)throw new Error('Blocked');return values.get(key)||null;},setItem:(key,value)=>{if(blocked)throw new Error('Blocked');values.set(key,value);}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},dispatchEvent:event=>events.push(event),fetch:()=>{throw new Error('Preferences must not use network');}};vm.runInNewContext(source,context);return{api:context.module.exports,values,events};}
const plain=value=>JSON.parse(JSON.stringify(value));
test('favourites are validated, device-local and reset with one notification',()=>{
    const {api,values,events}=setup();
    assert.equal(api.hasAny(),false);api.toggleLeague('f2');api.toggleTeam('nba','14','Miami Heat');
    assert.equal(api.isLeague('f2'),true);assert.equal(api.isTeam('nba',14),true);
    assert.equal(values.has(api.storageKey),true);assert.equal(api.hasAny(),true);
    const before=events.length;api.clear();assert.equal(events.length,before+1);assert.equal(api.hasAny(),false);
    assert.deepEqual(plain(events.at(-1).detail),{leagues:[],teams:[],drivers:[]});
});
test('invalid storage falls back to defaults; duplicates and unknown leagues are excluded',()=>{
    const {api,values}=setup();
    values.set(api.storageKey,'malformed JSON');assert.equal(api.hasAny(),false);
    values.set(api.storageKey,JSON.stringify({leagues:['nba','nba','invented'],teams:[{sport:'nba',id:14,name:'Miami Heat'},{sport:'nba',id:'14',name:'Duplicate'},{sport:'bad',id:2,name:'Bad'}]}));
    assert.deepEqual(plain(api.get()),{leagues:['nba'],teams:[{sport:'nba',id:'14',name:'Miami Heat'}],drivers:[]});
    api.toggleLeague('invented');assert.deepEqual(plain(api.get().leagues),['nba']);
});
test('blocked browser storage retains preferences for the visit and toggle removes exact identities',()=>{
    const {api}=setup(true);api.toggleDriver('f1','verstappen','Max Verstappen');api.toggleTeam('f2','674','Invicta Racing');
    assert.equal(api.isDriver('f1','verstappen'),true);assert.equal(api.isTeam('f2','674'),true);
    api.toggleTeam('f2','674','Invicta Racing');assert.equal(api.isTeam('f2','674'),false);assert.equal(api.hasAny(),true);
    api.clear();assert.equal(api.hasAny(),false);
});
