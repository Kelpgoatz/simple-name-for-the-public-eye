const test=require('node:test');
const assert=require('node:assert/strict');
const following=require('../home-following.js');
const ladders=require('../home-ladders.js');
const now=Date.parse('2026-11-05T00:00:00Z');
const game=(id,sport,home,away,time)=>({sport,match:{id,status:'scheduled',home:{id:home},away:{id:away}},startTime:new Date(time)});

test('default sport view excludes F2; league and team stars filter only their matching games',()=>{
    const nba=game('one','nba','1','2','2026-11-05T01:00:00Z');
    const nfl=game('two','nfl','1','2','2026-11-05T01:00:00Z');
    assert.equal(following.follows(nba,{}),true);
    assert.equal(following.follows({sport:'f2',f2Race:{id:'r'}},{}),false);
    const prefs={leagues:[],teams:[{sport:'nba',id:'2'}]};
    assert.equal(following.follows(nba,prefs),true);
    assert.equal(following.follows(nfl,prefs),false);
    assert.equal(following.follows(nfl,{leagues:['nfl']}),true);
    assert.equal(following.follows({match:{homeTeam:'Sydney',awayTeam:'Carlton'}},{teams:[{sport:'afl',id:'sydneyswans'}]}),true);
});
test('racing follows exact constructors or drivers and includes their forthcoming weekends',()=>{
    const f1={race:{raceId:'r',results:[{teamId:'mercedes',driverId:'russell'}]}};
    assert.equal(following.follows(f1,{teams:[{sport:'f1',id:'mercedes'}]}),true);
    assert.equal(following.follows(f1,{drivers:[{sport:'f1',id:'russell'}]}),true);
    assert.equal(following.follows(f1,{teams:[{sport:'f1',id:'ferrari'}]}),false);
    assert.equal(following.follows({sport:'f2',f2Race:{sessions:[]}},{teams:[{sport:'f2',id:'674'}]}),true);
});
test('starred teams retain their next fixture outside the default window without duplicates',()=>{
    const earlier=game('past','nba','1','2','2026-10-01T01:00:00Z');
    const next=game('next','nba','1','3','2026-12-01T01:00:00Z');
    const later=game('later','nba','1','4','2026-12-03T01:00:00Z');
    const prefs={teams:[{sport:'nba',id:'1'},{sport:'nba',id:'3'}]};
    assert.deepEqual(following.outsideWindow([later,earlier,next],prefs,[],now),[next]);
    assert.deepEqual(following.outsideWindow([later,earlier,next],prefs,[next],now),[]);
    assert.deepEqual(following.outsideWindow([earlier],prefs,[],now),[earlier]);
});
test('starred teams choose their actual conference and preserve both when both are followed',()=>{
    const card=(id,team)=>({id,sport:'nba',seasonEnd:now+1000,rows:[{teamId:team,name:team}]});
    const cards=[card('east','1'),card('west','2'),{...card('nfl','3'),sport:'nfl'}];
    const selected=ladders.preferredLadders(cards,{teams:[{sport:'nba',id:'2'}]},now);
    assert.deepEqual(selected.flatMap(choice=>choice.views.map(view=>view.id)),['west']);
    const both=ladders.preferredLadders(cards,{teams:[{sport:'nba',id:'1'},{sport:'nba',id:'2'}]},now);
    assert.equal(both.length,2);
    assert.equal(ladders.rowFollowed({sport:'afl',type:'afl'},{name:'Sydney'},{teams:[{sport:'afl',id:'sydneyswans'}]}),true);
});
test('F2 summaries preserve source session order and escape names in optional homepage cards',()=>{
    const data={races:[{id:'1',round:1,name:'<Race>',location:'<Place>',startDate:'2026-12-01',sessions:[{label:'Practice',startTime:'2026-12-01T01:00:00Z',results:[]}]}]};
    const rows=following.f2Summaries(data,now);
    assert.equal(rows[0].sport,'f2');
    assert.equal(rows[0].state.isFinished,false);
    assert.match(following.renderF2(rows[0]),/&lt;Place&gt;/);
    assert.doesNotMatch(following.renderF2(rows[0]),/<Place>/);
});

test('a Tennis favourite gets a tournament card without inventing a league ladder',()=>{
    const tennis={season:2027,tournament:{name:'Australian Open',startDate:'2027-01-17',endDate:'2027-01-31'}};
    assert.deepEqual(ladders.cardsFor({tennis},now),[]);
    const cards=ladders.cardsFor({tennis},now,['tennis']);
    assert.equal(cards.length,1);
    assert.equal(cards[0].type,'tournament');
    assert.equal(cards[0].tournament.name,'Australian Open');
    assert.equal(cards[0].href,'tennis.html');
});
