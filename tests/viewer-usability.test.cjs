const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {restoreStarFocus}=require('../viewer-favourites.js');
const {loadNotice,preferencesForScope,validSource}=require('../home-ladders.js');

function focusSetup(){
    const doc={body:{},activeElement:null,buttons:[],querySelectorAll(){return this.buttons;},querySelector(){return null;}};
    doc.activeElement=doc.body;
    const node=(dataset={},extra={})=>({dataset,isConnected:true,attributes:{},closest(){return null;},contains(){return false;},setAttribute(key,value){this.attributes[key]=value;},focus(options){this.focusOptions=options;doc.activeElement=this;},...extra});
    return{doc,node};
}
test('a rebuilt favourite regains focus by exact identity in its original section without scrolling',()=>{
    const {doc,node}=focusSetup();
    const identity={favouriteKind:'driver',favouriteSport:'f3',favouriteId:'same-id'};
    const elsewhere=node(identity),right=node(identity),wrong=node({...identity,favouriteSport:'f2'});
    const region=node({}, {contains:target=>target===right});
    const request={kind:'driver',sport:'f3',id:'same-id',source:node(identity,{isConnected:false}),region,expiresAt:1000};
    doc.buttons=[wrong,elsewhere,right];
    assert.equal(restoreStarFocus(doc,request,1),true);
    assert.equal(doc.activeElement,right);
    assert.deepEqual(right.focusOptions,{preventScroll:true});
    // A later asynchronous ladder paint may replace the restored button again.
    right.isConnected=false;doc.activeElement=doc.body;
    const next=node(identity);doc.buttons=[next];
    assert.equal(restoreStarFocus(doc,request,2),true);
    assert.equal(doc.activeElement,next);
});
test('favourite restoration respects another focused control and its time limit',()=>{
    const {doc,node}=focusSetup(),replacement=node({favouriteKind:'league',favouriteSport:'nba',favouriteId:'nba'});
    const request={kind:'league',sport:'nba',id:'nba',source:node({}, {isConnected:false}),expiresAt:1000};
    doc.buttons=[replacement];doc.activeElement=node();
    assert.equal(restoreStarFocus(doc,request,1),false);
    assert.notEqual(doc.activeElement,replacement);
    doc.activeElement=doc.body;
    assert.equal(restoreStarFocus(doc,request,1001),false);
});
test('removing the last visible favourite returns focus to its section instead of a hidden star',()=>{
    const {doc,node}=focusSetup(),region=node();
    const hidden=node({favouriteKind:'league',favouriteSport:'f2',favouriteId:'f2'},{closest:()=>({hidden:true})});doc.buttons=[hidden];
    const request={kind:'league',sport:'f2',id:'f2',source:node({}, {isConnected:false}),region,expiresAt:1000};
    assert.equal(restoreStarFocus(doc,request,1),true);
    assert.equal(doc.activeElement,region);
    assert.equal(region.attributes.tabindex,'-1');
    assert.deepEqual(region.focusOptions,{preventScroll:true});
});
test('All sport uses default ladder preferences without deleting saved stars',()=>{
    const prefs={leagues:['f2'],teams:[{sport:'nba',id:'14',name:'Miami Heat'}],drivers:[]};
    const before=JSON.stringify(prefs);
    assert.deepEqual(preferencesForScope(prefs,'all'),{leagues:[],teams:[],drivers:[]});
    assert.equal(preferencesForScope(prefs,'following'),prefs);
    assert.equal(JSON.stringify(prefs),before);
});
test('ladder notices distinguish unpublished seasons, loading and unavailable saved updates',()=>{
    assert.match(loadNotice({loading:true}).message,/Loading/);
    assert.equal(loadNotice({cards:1,loaded:true}),null);
    assert.match(loadNotice({loaded:true}).message,/No season ladders are active/);
    assert.match(loadNotice({loaded:true,following:true}).message,/starred selections/);
    const error=loadNotice({loaded:true,failures:['NBA','NBA','F1'],cards:1,saved:true});
    assert.match(error.message,/NBA, F1/);
    assert.match(error.message,/saved standings/);
    assert.equal(error.retry,true);
    assert.doesNotMatch(error.message,/competitions begin/);
});
test('empty published snapshots remain valid while corrupt identities and wrong-sport data are rejected',()=>{
    assert.equal(validSource('aflStandings',[]),true);
    assert.equal(validSource('drivers',{drivers_championship:[]}),true);
    assert.equal(validSource('nba',{sport:'nba',groups:[],standings:[]}),true);
    assert.equal(validSource('aflStandings',{}),false);
    assert.equal(validSource('drivers',{drivers_championship:[{driver:null}]}),false);
    assert.equal(validSource('nba',{sport:'nfl',groups:[],standings:[]}),false);
    assert.equal(validSource('nba',{sport:'nba',groups:[],standings:[{rows:[{team:null}]}]}),false);
});

function ladderHarness(){
    const handlers={},requests=[];let mode='failed',scope='following';
    const prefs={leagues:['nba'],teams:[],drivers:[]};
    const doc={activeElement:null};
    class Element{
        constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.events={};this.textContent='';this.className='';this.isConnected=true;this.classList={contains:name=>this.className.split(/\s+/).includes(name)};}
        appendChild(child){this.children.push(child);child.parentElement=this;child.isConnected=this.isConnected;return child;}
        replaceChildren(){const detach=node=>{node.isConnected=false;node.children.forEach(detach);};this.children.forEach(detach);this.children=[];}
        setAttribute(key,value){this.attributes[key]=value;}
        addEventListener(name,callback){this.events[name]=callback;}
        contains(target){return this===target||this.children.some(child=>child.contains(target));}
        querySelector(selector){return this.children.find(child=>selector.startsWith('.')&&child.className.split(/\s+/).includes(selector.slice(1)))||this.children.map(child=>child.querySelector(selector)).find(Boolean)||null;}
        focus(options){doc.activeElement=this;this.focusOptions=options;}
    }
    const sidebar=new Element('aside');doc.body=new Element('body');doc.activeElement=doc.body;doc.createElement=tag=>new Element(tag);doc.querySelector=selector=>selector==='[data-home-ladders]'?sidebar:null;
    const empty=url=>url==='standings.json'||url==='afl-fixtures.json'?[]:url==='f1-fixtures.json'?{season:2026,races:[]}:url==='drivers-championship.json'?{season:2026,drivers_championship:[]}:url==='constructors-championship.json'?{season:2026,constructors_championship:[]}:{groups:[],standings:[],tournament:{}};
    const nba={sport:'nba',seasonLabel:'2026–27',seasonStart:'2026-10-01',seasonEnd:'2027-06-20',groups:[],standings:[{id:'east',label:'Eastern Conference',rows:[{rank:1,team:{id:'14',name:'Miami Heat',abbreviation:'MIA'},wins:5,losses:1}]}]};
    const context={module:{exports:{}},document:doc,window:{HomeWelcome:{getScope:()=>scope},addEventListener:(name,callback)=>{handlers[name]=callback;}},ViewerFavourites:{get:()=>prefs},TeamNames:{label:(_sport,name)=>name},SportIdentity:{apply(){}},Date:class extends Date{static now(){return Date.parse('2026-11-06T00:00:00Z');}},queueMicrotask,SportsSnapshots:{read:async url=>{requests.push(url);if(mode==='failed')throw new Error('Unavailable');return mode==='nba'&&url==='sports-data/nba.json'?nba:empty(url);}}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../home-ladders.js'),'utf8'),context);
    const content=node=>[node.textContent,...node.children.map(content)].join(' ');
    return{doc,sidebar,prefs,handlers,requests,content:()=>content(sidebar),setMode:value=>{mode=value;},setScope:value=>{scope=value;},start:()=>context.module.exports.init(doc)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('failed ladder requests stay visible across scope changes and recover through the Retry action',async()=>{
    const app=ladderHarness();app.start();assert.match(app.content(),/Loading competition ladders/);await settle();
    assert.match(app.content(),/Standings are temporarily unavailable for NBA/);
    assert.equal(app.sidebar.attributes['aria-busy'],'false');
    const initialRequests=app.requests.length;
    app.setScope('all');app.handlers['viewer-home-scope-change']();
    assert.match(app.content(),/temporarily unavailable/);
    assert.equal(app.requests.length,initialRequests,'changing scope reuses the same loaded sources');
    assert.deepEqual(app.prefs.leagues,['nba']);
    app.setMode('empty');
    const retry=app.sidebar.querySelector('.home-data-retry');app.doc.activeElement=retry;await retry.events.click();
    assert.match(app.content(),/No season ladders are active/);
    assert.equal(app.sidebar.querySelector('.home-data-retry'),null);
    assert.equal(app.doc.activeElement,app.sidebar,'successful retry returns focus to the updated sidebar');
});
test('a later ladder failure keeps valid standings and identifies the saved update',async()=>{
    const app=ladderHarness();app.setMode('nba');app.start();await settle();
    assert.match(app.content(),/Miami Heat/);
    const initialRequests = app.requests.length;
    app.setMode('failed');await app.handlers['viewer-favourites-change']();
    assert.equal(app.requests.length,initialRequests,'updating favourites reuses the same loaded sources');
    await app.handlers['viewer-home-refresh']();
    assert.match(app.content(),/Miami Heat/);
    assert.match(app.content(),/NBA ladder updates are unavailable/);
    assert.match(app.content(),/Showing saved standings/);
    assert.ok(app.sidebar.querySelector('.home-data-retry'));
});
