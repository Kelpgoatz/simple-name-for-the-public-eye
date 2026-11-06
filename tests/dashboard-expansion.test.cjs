const test=require('node:test');
const assert=require('node:assert/strict');
const view=require('../sport-view.js');
const home={id:'A',name:'Alpha'},away={id:'B',name:'Beta'},other={id:'C',name:'Other'};
const fixture=(id,day,options={})=>({id,startTime:`2026-11-${String(day).padStart(2,'0')}T10:00:00Z`,home,away,status:'final',homeScore:10,awayScore:5,winner:'home',...options});
const snapshot=matches=>({sport:'nba',season:2027,seasonLabel:'2026-27',groups:[{id:'group',label:'November games',matches}]});

test('season phase filtering distinguishes explicit preseason and finals without treating a tennis final as postseason',()=>{
    const matches=[fixture('pre',1,{roundLabel:'Preseason'}),fixture('regular',2),fixture('final',3,{groupLabel:'Preliminary Finals'})];
    assert.deepEqual(view.availablePhases(matches,'afl'),['all','regular','preseason','postseason']);
    assert.deepEqual(view.filterPhase(matches,'regular','afl').map(match=>match.id),['regular']);
    assert.deepEqual(view.filterPhase(matches,'postseason','afl').map(match=>match.id),['final']);
    assert.deepEqual(view.availablePhases(matches,'tennis'),[]);
    assert.equal(view.matchPhase({roundLabel:'Grand Final'},'tennis'),'regular');
    assert.deepEqual(view.availablePhases([fixture('one',1)],'nba'),[]);
});

test('matchup records and previous meetings exclude this game, later results, live games and other phases',()=>{
    const target=fixture('selected',5);
    const before=fixture('before',2,{home:away,away:home,homeScore:8,awayScore:4,winner:'home'});
    const games=[fixture('pre',1,{roundLabel:'Preseason'}),before,fixture('vsOther',3,{away:other}),fixture('live',4,{status:'live'}),target,fixture('later',8)];
    const result=view.matchupSummary(snapshot(games),target);
    assert.equal(result.phase,'regular');
    assert.deepEqual(result.meetings.map(match=>match.id),['before']);
    assert.equal(result.home.played,2);
    assert.equal(result.home.wins,1);
    assert.equal(result.home.losses,1);
    assert.equal(result.away.played,1);
    assert.equal(result.headToHead.wins,0);
    assert.equal(result.headToHead.losses,1);
    assert.match(view.matchupMarkup(snapshot(games),target),/Before this game/);
});

test('undated matches do not invent pregame comparisons',()=>{
    const target=fixture('tbc',5,{startTime:null,status:'scheduled'});
    const data=snapshot([fixture('before',1),target]);
    assert.equal(view.matchupSummary(data,target).dated,false);
    assert.match(view.matchupMarkup(data,target),/once a start time is confirmed/);
    assert.doesNotMatch(view.matchupMarkup(data,target),/viewer-comparison__row/);
});

test('recent results are chronological, exclude incomplete games and retain the team perspective',()=>{
    const matches=[fixture('one',1),fixture('two',2,{home:away,away:home}),fixture('three',3,{status:'scheduled'}),fixture('four',4,{home:other,away})];
    const original=matches.map(match=>match.id);
    assert.deepEqual(view.recentGames(matches,'A').map(match=>match.id),['two','one']);
    assert.deepEqual(matches.map(match=>match.id),original);
    const markup=view.recentMarkup(matches,home,'nba');
    assert.match(markup,/data-result="L"/);
    assert.match(markup,/sport=nba&match=two/);
    assert.match(markup,/Beta/);
    assert.match(markup,/Away/);
});

test('leading performances use reported positive values, show shared leads and escape provider names',()=>{
    const categories=[{key:'points',label:'Points'},{key:'assists',label:'Assists'},{key:'missing',label:'Unavailable'}];
    const players=[{id:'one',name:'Zoe',teamName:'Alpha',stats:{points:15,assists:0}},{id:'two',name:'<Ada>',teamName:'Beta',stats:{points:15,assists:null}},{id:'three',name:'Sam',teamName:'Other',stats:{points:2,assists:0}}];
    const data={sport:'nba',categories,matches:{one:{players}}};
    const leaders=view.gameLeaders(data,{id:'one'});
    assert.equal(leaders.length,1);
    assert.equal(leaders[0].player.name,'<Ada>');
    assert.equal(leaders[0].tied,2);
    const markup=view.gameLeadersMarkup(data,{id:'one'});
    assert.match(markup,/&lt;Ada&gt;/);
    assert.match(markup,/Shared lead with 1 other/);
    assert.doesNotMatch(markup,/<Ada>/);
    assert.equal(view.gameLeadersMarkup(null,{id:'one'}),'');
});

test('retained tennis draws use their actual match years rather than an unpublished future tournament season',()=>{
    const data={sport:'tennis',season:2027,seasonLabel:'Australian Open 2027',groups:[{matches:[fixture('past',1)]}]};
    assert.equal(view.scopeLabel(data),'2026 published singles draw');
    assert.equal(view.scopeLabel({sport:'tennis',season:2027,groups:[]}),'Published singles draw');
    assert.equal(view.scopeLabel(snapshot([])),'2026-27');
});
