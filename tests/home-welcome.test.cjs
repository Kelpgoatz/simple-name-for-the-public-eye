const test=require('node:test'),assert=require('node:assert/strict');
const {selectionCount,scopeFor,aflState}=require('../home-welcome.js');
test('switching to all sport leaves every starred selection intact',()=>{
    const preferences={leagues:['f2','nba'],teams:[{sport:'afl',id:'melbourne',name:'Melbourne'}],drivers:[{sport:'f1',id:'hamilton',name:'Lewis Hamilton'}]};
    const before=JSON.stringify(preferences);
    assert.equal(selectionCount(preferences),4);assert.equal(scopeFor(preferences,null),'following');assert.equal(scopeFor(preferences,'all'),'all');assert.equal(scopeFor(preferences,'following'),'following');assert.equal(JSON.stringify(preferences),before);
    assert.equal(scopeFor({leagues:[],teams:[],drivers:[]},'following'),'all');
});
test('scheduled AFL games cannot turn live or final based only on elapsed time and scores',()=>{
    const start=new Date('2026-08-01T09:00:00Z');
    for(const elapsed of [1,30,180,1440]){const state=aflState({status:'SCHEDULED',homeScore:101,awayScore:97},start,start.getTime()+elapsed*60000);assert.equal(state.isLive,false);assert.equal(state.isFinished,false);assert.equal(state.isPending,true);}
});
test('AFL status uses provider confirmation, and postponements override times and scores',()=>{
    const start=new Date('2026-08-01T09:00:00Z'),now=start.getTime()+3600000;
    assert.equal(aflState({status:'LIVE'},start,now).isLive,true);assert.equal(aflState({status:'IN_PROGRESS'},null,now).isLive,true);
    assert.equal(aflState({status:'CONCLUDED'},start,now).isFinished,true);
    const postponed=aflState({status:'POSTPONED',homeScore:0,awayScore:0},start,now);assert.equal(postponed.isTbc,true);assert.equal(postponed.isLive,false);assert.equal(postponed.isFinished,false);
    const countdown=aflState({status:'SCHEDULED'},start,start.getTime()-5*60000);assert.equal(countdown.isCountdown,true);assert.equal(countdown.isLive,false);
    assert.equal(aflState({status:'SCHEDULED'},null,now).isScheduled,true);
    const oldLive=aflState({status:'LIVE'},start,start.getTime()+4*3600000+1);assert.equal(oldLive.isLive,false);assert.equal(oldLive.isPending,true);
    for (const status of ['DELAYED', 'SUSPENDED', 'ABANDONED']) {
        const state=aflState({status},start,start.getTime()-60000);
        assert.equal(state.isTbc,true);
        assert.equal(state.isCountdown,false);
    }
});

test('homepage snapshots distinguish empty fixtures from corrupt or wrong-competition data',()=>{
    const home=require('../home-sports.js');
    assert.equal(home.validSnapshot({sport:'nba',groups:[]},'nba'),true);
    for(const groups of [{},[null],[{matches:null}],[{matches:[null]}]])assert.equal(home.validSnapshot({sport:'nba',groups},'nba'),false);
    assert.equal(home.validSnapshot({sport:'wnba',groups:[]},'nba'),false);
    const match={id:'real-game',status:'scheduled',startTime:'2026-11-06T02:00:00Z'};const data={sport:'nba',groups:[{matches:[match]}]};
    assert.equal(home.validSnapshot(data,'nba'),true);assert.equal(home.summaries(data).length,1);
});

test('next start uses the next timed racing session and links to that session',()=>{
    const home=require('../home-welcome.js'),progress=require('../weekend-progress.js'),now=Date.parse('2026-11-06T10:00:00Z');
    const race={raceId:'brazil_2026',round:20,name:'Brazilian Grand Prix',startTime:'2026-11-08T17:00:00Z',results:[]};
    const games=[{race},{sport:'nfl',match:{id:'match',status:'scheduled',home:{name:'Home'},away:{name:'Away'}},startTime:new Date('2026-11-07T10:00:00Z')}];
    const next=home.nextEvent(games,{now,progress,weekends:{brazil_2026:{sessions:{fp1:{label:'P1',startTime:'2026-11-06T15:30:00Z',results:[]}}}}});
    assert.equal(next.sport,'f1');assert.equal(next.detail,'P1');assert.equal(next.timestamp,Date.parse('2026-11-06T15:30:00Z'));assert.match(next.href,/round=20&session=fp1$/);
    assert.equal(home.startsIn(next.timestamp,now),'In 5h 30m');
});
test('next start excludes past, postponed and unknown-time events, and feeder links preserve source IDs',()=>{
    const home=require('../home-welcome.js'),progress=require('../weekend-progress.js'),now=Date.parse('2026-11-06T10:00:00Z');
    const games=[{sport:'nba',startTime:new Date(now-1000),match:{status:'scheduled'}},{sport:'nrl',startTime:new Date(now+60000),match:{status:'postponed'}},...['DELAYED','SUSPENDED','ABANDONED'].map(status=>({sport:'afl',startTime:new Date(now+60000),match:{status}}))];
    assert.equal(home.nextEvent(games,{now,progress}),null);
    const id='f2/race?meeting=1&session=2';const next=home.nextEvent([{sport:'f2',f2Race:{round:14,name:'Race weekend',sessions:[{id,label:'Feature Race',startTime:'2026-11-07T10:00:00Z',results:[]}]}}],{now,progress});
    assert.equal(new URL(next.href,'https://example.com').searchParams.get('session'),id);
    assert.equal(home.startsIn(NaN,now),'');assert.equal(home.startsIn(now-1,now),'');
});
