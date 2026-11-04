const test = require('node:test');
const assert = require('node:assert/strict');
const profile = require('../f1-profile.js');
const fixtures = {
    season:2026,
    drivers:[{driverId:'driver_a',teamId:'team_a',position:1,points:40,driver:{name:'Ada',surname:'A',number:12}}],
    constructors:[{teamId:'team_a',position:1,points:60}],
    teamName:id=>id==='team_a'?'Team A':id,
    races:[
        {raceId:'r1',round:1,name:'First Grand Prix',fastestLap:{driverId:'driver_a'},results:[{driverId:'driver_a',teamId:'team_a',driver:{name:'Ada',surname:'A'},position:'1',grid:'3',points:25,fastLap:'1:20.500'},{driverId:'driver_b',teamId:'team_a',driver:{name:'Bob',surname:'B'},position:'4',grid:'Pit lane',points:12}]},
        {raceId:'r2',round:2,name:'Second Grand Prix',results:[{driverId:'driver_a',teamId:'team_a',position:'DSQ',grid:1,points:0},{driverId:'driver_b',teamId:'team_b',position:'2',grid:2,points:18}]},
        {raceId:'r3',round:3,name:'Future Grand Prix',results:[]}
    ],
    weekends:{r1:{sessions:{sprint:{results:[{driverId:'driver_a',teamId:'team_a',position:'2',points:7}]},qualifying:{results:[{driverId:'driver_a',teamId:'team_a',position:'1'}]}}}}
};
test('driver totals include sprints separately and averages exclude unclassified positions and pit starts',()=>{
    const result = profile.build({...fixtures,kind:'driver',id:'driver_a'});
    const totals = Object.fromEntries(result.totals), averages = Object.fromEntries(result.averages);
    assert.equal(totals['Grand Prix points'],25);
    assert.equal(totals['Sprint points'],7);
    assert.equal(totals['Grand Prix wins'],1);
    assert.equal(totals.Podiums,1);
    assert.equal(totals['Qualifying poles'],1);
    assert.equal(totals['Race fastest laps'],1);
    assert.equal(averages['GP points / driver result'],12.5);
    assert.equal(averages['Classified GP position'],1);
    assert.equal(averages['Places gained / GP'],2);
    assert.equal(result.best.race.round,1);
    assert.equal(result.weekends,2);
});
test('constructor totals follow results at that team, including driver changes without leaking another team',()=>{
    const result = profile.build({...fixtures,kind:'team',id:'team_a'});
    assert.equal(Object.fromEntries(result.totals)['Grand Prix points'],37);
    assert.deepEqual(result.roster.map(person=>[person.id,person.points,person.starts]),[['driver_a',25,2],['driver_b',12,1]]);
    assert.equal(result.name,'Team A');
    assert.equal(Object.fromEntries(result.averages)['Places gained / GP'],2);
    assert.equal(profile.build({...fixtures,kind:'driver',id:'unknown'}),null);
});
test('profile links retain round and session context and provider text is escaped',()=>{
    const result = profile.build({...fixtures,kind:'driver',id:'driver_a'});
    result.name = '<script>alert(1)</script>';
    const markup = profile.renderMarkup(result,'average',{round:2,session:'fp1',tab:'drivers',teamName:fixtures.teamName});
    assert.match(markup,/&lt;script&gt;/);
    assert.doesNotMatch(markup,/<script>/);
    assert.match(markup,/team=team_a/);
    assert.match(markup,/session=fp1/);
    assert.match(markup,/data-profile-mode="average" aria-pressed="true"/);
    assert.match(markup,/12\.5/);
});
test('selected session shows each constructor driver with exact points and a labelled pit lane',()=>{
    const markup = profile.renderSessionMarkup({kind:'team',id:'team_a'},fixtures.races[0],'race',fixtures.races[0],fixtures.teamName);
    assert.match(markup,/Pit lane/);
    assert.match(markup,/Ada A/);
    assert.match(markup,/Bob B/);
    assert.match(markup,/1:20\.500/);
    assert.match(markup,/driver=driver_b/);
    assert.match(profile.renderSessionMarkup({kind:'driver',id:'driver_a'},fixtures.races[2],'race',fixtures.races[2]),/No published result/);
});
