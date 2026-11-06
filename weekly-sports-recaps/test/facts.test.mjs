import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFacts,eventTime,SPORTS,DEFAULT_SOURCE_BASE_URL} from '../src/facts.mjs';

const week={id:'2026-11-09',label:'Week ending Monday 9 November, 6pm Sydney',start:'2026-11-02T07:00:00Z',end:'2026-11-09T07:00:00Z',timeZone:'Australia/Sydney'};
const home={id:'A',name:'Alpha'},away={id:'B',name:'Beta'};
const match=(id='game',options={})=>({id,startTime:'2026-11-04T09:00:00Z',status:'final',home,away,homeScore:10,awayScore:0,winner:'home',venue:'The Park',...options});
const generic=(sport='nba',matches=[match()],extra={})=>({sport,season:2027,seasonLabel:'2026–27',groups:[{id:'round',label:'Round 1',matches}],...extra});
const player=(id,name,teamId,points,assists=0)=>({id,name,teamId,teamName:teamId==='A'?'Alpha':'Beta',stats:{points,assists}});
const stats=(records={},extra={})=>({sport:'nba',season:2027,categories:[{key:'points',label:'Points'},{key:'assists',label:'Assists'}],matches:records,...extra});
const record=(id,players,extra={})=>({id,status:'final',players,...extra});
const row=(id='one',position=1,extra={})=>({driverId:id,driver:{name:id==='one'?'Ada':'Bea',surname:'Driver'},teamId:'team',position:String(position),grid:String(position),points:position===1?25:18,time:position===1?'1:30:00.000':'+2.000',fastLap:position===1?'1:20.000':'1:20.500',...extra});
const f1Race=(extra={})=>({raceId:'test_2026',round:1,name:'Formula 1 Test Grand Prix',startTime:'2026-11-08T17:00:00Z',status:'CONCLUDED',results:[row(),row('two',2)],fastestLap:{driverId:'one',time:'1:20.000'},resultsSource:'https://example.org/f1/results',...extra});
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('strict timestamps accept actual AFL offsets and reject date-only or invalid calendar values',()=>{
    assert.equal(eventTime('2026-11-04T09:00:00.000+0000'),'2026-11-04T09:00:00.000Z');
    assert.equal(eventTime('2026-11-04T20:00:00+11:00'),'2026-11-04T09:00:00.000Z');
    for(const value of ['2026-11-04','2026-02-30T09:00:00Z','2026-11-04T24:00:00Z','2026-11-04T09:60:00Z','2026-11-04T09:00:00',null,0])assert.equal(eventTime(value),null,String(value));
});
test('weekly boundaries are exact and scheduled/live placeholder scores never become final results',()=>{
    const games=[match('at-start',{startTime:week.start}),match('before',{startTime:'2026-11-02T06:59:59Z'}),match('at-end',{startTime:week.end}),match('live',{status:'live',homeScore:0,awayScore:0}),match('scheduled',{status:'scheduled',homeScore:0,awayScore:0}),match('no-clock',{startTime:'2026-11-04'})];
    const facts=buildFacts('nba',{generic:generic('nba',games)},week);
    assert.deepEqual(facts.events.map(event=>event.id),['nba:at-start']);
    assert.equal(facts.coverage.status,'ready');
    assert.equal(facts.coverage.excludedUnfinished,2);
    assert.equal(facts.coverage.completedWithoutTime,1);
    assert.equal(facts.coverage.partial,true);
    assert.equal(facts.events[0].scores.away,0);
    assert.equal(facts.events[0].winner.name,'Alpha');
});
test('missing snapshots and genuinely quiet weeks are distinct, including invalid sport/window inputs',()=>{
    assert.equal(buildFacts('nba',{},week).coverage.status,'unavailable');
    assert.equal(buildFacts('nba',{generic:generic('nba',[])},week).coverage.status,'no_events');
    assert.equal(buildFacts('nba',{generic:generic('nfl',[])},week).coverage.status,'unavailable');
    assert.throws(()=>buildFacts('invented',{},week),/Unsupported sport/);
    assert.throws(()=>buildFacts('nba',{}, {...week,start:'2026-11-02'}),/valid inclusive start/);
    assert.throws(()=>buildFacts('nba',{},week,{maxEvents:0}),/maxEvents/);
});
test('input objects stay immutable and provenance uses configured snapshot and primary URLs',()=>{
    const snapshots=freeze({generic:generic('nrl',[match('nrl',{url:'https://www.nrl.com/draw/result/'})])});
    const before=JSON.stringify(snapshots),window=freeze({...week});
    const facts=buildFacts('nrl',snapshots,window,{sourceBaseUrl:'https://data.example.org/viewer',retrievedAt:'2026-11-09T07:05:00Z'});
    assert.equal(JSON.stringify(snapshots),before);
    assert.notEqual(facts.week,window);
    assert.ok(facts.sources.some(source=>source.url==='https://data.example.org/viewer/sports-data/nrl.json'));
    const primary=facts.sources.find(source=>source.id===facts.events[0].sourceId);
    assert.equal(primary.url,'https://www.nrl.com/draw/result/');
    assert.equal(primary.retrievedAt,'2026-11-09T07:05:00.000Z');
    assert.equal(facts.events[0].snapshotSourceId,'generic');
});
test('duplicates are counted once and conflicting copies are excluded rather than picked arbitrarily',()=>{
    const one=match('one');
    const facts=buildFacts('nba',{generic:generic('nba',[one,{...one},match('conflict'),match('conflict',{homeScore:99})])},week);
    assert.deepEqual(facts.events.map(event=>event.id),['nba:one']);
    assert.equal(facts.coverage.duplicateEvents,2);
    assert.deepEqual(facts.coverage.conflictingEventIds,['nba:conflict']);
    assert.equal(facts.coverage.partial,true);
});
test('missing or conflicting scores remain explicit while tennis retirements preserve published winners',()=>{
    const facts=buildFacts('nba',{generic:generic('nba',[match('missing',{homeScore:null}),match('wrong',{winner:'away'}),match('draw',{homeScore:0,awayScore:0,winner:null})])},week);
    assert.equal(facts.events.find(event=>event.id==='nba:missing').scores.home,null);
    assert.equal(facts.events.find(event=>event.id==='nba:wrong').winner,undefined);
    assert.equal(facts.events.find(event=>event.id==='nba:draw').result,'draw');
    assert.equal(facts.coverage.incompleteEvents,2);
    const tennis=buildFacts('tennis',{generic:generic('tennis',[match('retired',{homeScore:0,awayScore:1,winner:'home',sets:[{home:6,away:7,homeTiebreak:3,awayTiebreak:7}],statusDetail:'Retired'})])},week);
    assert.equal(tennis.events[0].winner.name,'Alpha');
    assert.deepEqual(tennis.events[0].sets,[{home:6,away:7,homeTiebreak:3,awayTiebreak:7}]);
    assert.equal(tennis.events[0].scores.unit,'sets');
});
test('weekly player leaders use only completed games in this window, deduplicate players and isolate trades',()=>{
    const snapshots={generic:generic('nba',[match('a'),match('b'),match('future',{status:'scheduled'})]),players:stats({a:record('a',[player('p','Ada','A',10,0),player('p','Ada duplicate','A',999,999),player('other','Wrong club','C',999)]),b:record('b',[player('p','Ada','B',20,null)]),future:record('future',[player('p','Ada','A',999,999)]),outside:record('outside',[player('p','Ada','A',999,999)])})};
    const facts=buildFacts('nba',snapshots,week);
    const points=facts.weeklyLeaders.find(category=>category.key==='points');
    assert.deepEqual(points.leaders.map(player=>[player.teamId,player.total,player.gamesWithStatistic]),[['B',20,1],['A',10,1]]);
    assert.equal(facts.weeklyLeaders.some(category=>category.key==='assists'),false,'recorded zero is not invented positive production');
    assert.equal(facts.coverage.statistics.status,'available');
    assert.equal(facts.events[0].stats.playersRecorded,1);
    assert.equal(facts.events[0].stats.leaders[0].value,10);
    assert.ok(facts.sources.find(source=>source.id===points.sourceId).url.endsWith('/sports-data/nba-players.json'));
});
test('optional missing, partial or wrong-season player statistics do not erase valid game results',()=>{
    const fixtures=generic('nba',[match('one'),match('two')]);
    const partial=buildFacts('nba',{generic:fixtures,players:stats({one:record('one',[player('p','Ada','A',5)])})},week);
    assert.equal(partial.coverage.statistics.status,'partial');
    assert.equal(partial.coverage.statistics.eventsWithoutStats,1);
    const wrong=buildFacts('nba',{generic:fixtures,players:stats({one:record('one',[player('p','Ada','A',999)])},{season:2026})},week);
    assert.equal(wrong.coverage.status,'ready');
    assert.equal(wrong.coverage.statistics.status,'unavailable');
    assert.deepEqual(wrong.weeklyLeaders,[]);
});
test('AFL fixtures and normalized player cache keep aliases, zero scores and +0000 dates',()=>{
    const snapshots={aflFixtures:[{round:1,matches:[{matchId:8,startTime:'2026-11-04T09:00:00.000+0000',status:'CONCLUDED',homeTeam:'Greater Western Sydney',awayTeam:'Hawthorn',homeScore:50,awayScore:0}]}],aflPlayerStats:{sport:'afl',season:2026,categories:[{key:'goals',label:'Goals'}],matches:{8:{id:'8',status:'final',players:[{id:'ada',name:'Ada',teamId:'GWS GIANTS',teamName:'GWS GIANTS',stats:{goals:4}}]}}}};
    const facts=buildFacts('afl',snapshots,week);
    assert.equal(facts.events[0].startTime,'2026-11-04T09:00:00.000Z');
    assert.equal(facts.events[0].winner.name,'Greater Western Sydney');
    assert.equal(facts.weeklyLeaders[0].leaders[0].total,4);
    assert.equal(facts.coverage.statistics.status,'available');
    assert.ok(facts.sources.some(source=>source.url===`${DEFAULT_SOURCE_BASE_URL}sports-data/afl-players.json`));
});
test('F1 includes completed timed practice, sprint qualifying, qualifying, sprint and race as distinct events',()=>{
    const race=f1Race();
    const session=(label,startTime)=>({label,startTime,status:'CONCLUDED',results:[row(),row('two',2)],source:'https://www.formula1.com/results/'+label,fastestLap:{driverId:'two',time:'1:20.500'}});
    const fixtures={season:2026,races:[race]};
    const sessions={season:2026,races:{test_2026:{sessions:{fp1:session('P1','2026-11-06T10:00:00Z'),sq:session('SQ','2026-11-06T14:00:00Z'),qualifying:session('Q','2026-11-07T14:00:00Z'),sprint:session('Sprint','2026-11-07T10:00:00Z'),pending:{...session('P2','2026-11-06T15:00:00Z'),status:'SCHEDULED'}}}}};
    const facts=buildFacts('f1',{f1Fixtures:fixtures,f1Sessions:sessions,f1Constructors:{season:2026,constructors_championship:[{teamId:'team',team:{teamName:'Team One'}}]}},week);
    assert.deepEqual(new Set(facts.events.map(event=>event.kind)),new Set(['practice','sprint_qualifying','qualifying','sprint','race']));
    assert.equal(facts.events.length,5);
    const grandPrix=facts.events.find(event=>event.kind==='race');
    assert.equal(grandPrix.winner.name,'Ada Driver');
    assert.equal(grandPrix.fastestLap.name,'Ada Driver');
    assert.equal(grandPrix.results[0].teamName,'Team One');
    assert.equal(facts.events.find(event=>event.kind==='practice').winner,undefined);
    assert.equal(facts.events.find(event=>event.kind==='practice').leader.name,'Ada Driver');
    assert.equal(facts.coverage.excludedUnfinished,1);
});
test('F1 has no date-only race fallback, mismatched sessions or guessed fastest laps',()=>{
    const facts=buildFacts('f1',{f1Fixtures:{season:2026,races:[f1Race({startTime:null,date:'2026-11-08'})]},f1Sessions:{season:2025,races:{}}},week);
    assert.equal(facts.coverage.status,'unavailable');
    assert.equal(facts.events.length,0);
    assert.equal(facts.coverage.completedWithoutTime,1);
    const race=f1Race({fastestLap:{driverId:'not-in-results',time:'1:19.000'}});
    const valid=buildFacts('f1',{f1Fixtures:{season:2026,races:[race]},f1Sessions:{season:2026,races:{}}},week);
    assert.equal(valid.events[0].fastestLap,undefined);
    const old=buildFacts('f1',{f1Fixtures:{season:2026,races:[f1Race({startTime:null,date:'2026-10-04'})]},f1Sessions:{season:2026,races:{}}},week);
    assert.equal(old.coverage.status,'no_events','an old undated race is not a gap in an unrelated later week');
    assert.equal(old.events.length,0,'calendar dates never create an assumed start time');
});
test('F2 and F3 retain full classifications, race points and recorded best laps without changing positions',()=>{
    for(const sport of ['f2','f3']){
        const session={id:'feature',label:'Feature race',type:'Race',state:'completed',startTime:'2026-11-08T09:00:00Z',timingSource:'https://www.fia.com/results',fastestLap:{driverId:'two',time:'1:18.000',lap:7},results:[{driverId:'one',name:'Ada',teamId:'t',position:'1',points:25,bestLap:'1:19.000',laps:20},{driverId:'two',name:'Bea',teamId:'t',position:'2',points:18,bestLap:'1:18.000',laps:20}]};
        const facts=buildFacts(sport,{[sport]:{season:2026,races:[{id:'meeting',round:3,name:'Test Grand Prix',sessions:[session,{...session,id:'later',state:'scheduled'}]}],teams:[{id:'t',name:'Team'}]}},week);
        assert.equal(facts.events.length,1);
        assert.equal(facts.events[0].winner.name,'Ada');
        assert.equal(facts.events[0].fastestLap.name,'Bea');
        assert.equal(facts.events[0].results[1].points,18);
        assert.equal(facts.events[0].results[1].position,2);
    }
});
test('all twelve supported sports produce deterministic factual packs',()=>{
    assert.equal(Object.keys(SPORTS).length,12);
    for(const sport of ['aflw','nrl','nrlw','nba','wnba','nbl','nfl','tennis']){
        const facts=buildFacts(sport,{generic:generic(sport)},week);
        assert.equal(facts.schemaVersion,1);
        assert.equal(facts.coverage.status,'ready',sport);
        assert.equal(facts.sport,sport);
        assert.deepEqual(facts,buildFacts(sport,{generic:generic(sport)},week));
    }
});
test('standings require a dated table inside this week and never imply weekly movement',()=>{
    const standings=[{id:'east',label:'East',rows:[{rank:1,team:home,wins:5,losses:1}]}];
    const undated=buildFacts('nba',{generic:generic('nba',[match()],{updatedAt:'2026-11-05T00:00:00Z',standings})},week);
    assert.equal(undated.standings,undefined);
    const current=buildFacts('nba',{generic:generic('nba',[match()],{standingsUpdatedAt:'2026-11-05T00:00:00Z',standings})},week);
    assert.equal(current.standings.groups[0].rows[0].wins,5);
    assert.match(current.standings.note,/no weekly table movement/);
    const later=buildFacts('nba',{generic:generic('nba',[match()],{standingsUpdatedAt:week.end,standings})},week);
    assert.equal(later.standings,undefined);
});
test('the default cap includes a full NBA week and overflow blocks generation instead of silently clipping',()=>{
    const fixtures=generic('nba',Array.from({length:110},(_,index)=>match(String(index))));
    const complete=buildFacts('nba',{generic:fixtures},week);
    assert.equal(complete.events.length,110);
    assert.equal(complete.coverage.truncated,false);
    const capped=buildFacts('nba',{generic:fixtures},week,{maxEvents:100});
    assert.equal(capped.events.length,100);
    assert.equal(capped.coverage.totalEvents,110);
    assert.equal(capped.coverage.omittedEvents,10);
    assert.equal(capped.coverage.status,'unavailable');
    assert.equal(capped.coverage.reason,'event_limit_exceeded');
});
