const test = require('node:test');
const assert = require('node:assert/strict');
const {isSeasonVisible, seasonWindow, cardsFor} = require('../home-ladders.js');
const season = {seasonStart:'2026-10-01T00:00:00Z',seasonEnd:'2027-06-20T00:00:00Z'};

test('women’s competitions qualify independently and retain their correct points or record', () => {
    const sources = Object.fromEntries(['aflw', 'nrlw', 'wnba'].map(sport => [sport, {...season,seasonLabel:'2026',standings:[{id:'overall',label:'Standings',rows:[{rank:1,team:{name:'A',abbreviation:'A'},points:40,wins:10,losses:2}]}]}]));
    const cards = cardsFor(sources,Date.parse('2026-11-01'));
    assert.deepEqual(cards.map(card=>card.title),['AFLW','NRLW','WNBA']);
    assert.deepEqual(cards.map(card=>card.rows[0].stat),['40 pts','40 pts','10–2']);
});
test('cross-year seasons appear only after starting and stay for exactly ten extra days', () => {
    assert.equal(isSeasonVisible(season,Date.parse('2026-09-30')),false);
    assert.equal(isSeasonVisible(season,Date.parse('2026-10-01')),true);
    assert.equal(isSeasonVisible(season,Date.parse('2027-06-29T23:59:59Z')),true);
    assert.equal(isSeasonVisible(season,Date.parse('2027-06-30')),false);
});
test('provider season end overrides last regular fixture when playoffs are unpublished', () => {
    assert.equal(seasonWindow({...season,groups:[{matches:[{startTime:'2027-04-01'}]}]}).end,Date.parse(season.seasonEnd));
});
test('AFL and NRL calendar bounds include the final fixture and missing calendars remain hidden', () => {
    const rounds=[{matches:[{startTime:'2026-03-01'},{startTime:'2026-09-26'}]}];
    assert.equal(seasonWindow(rounds).end,Date.parse('2026-09-26')+3*3600000);
    assert.equal(isSeasonVisible([],Date.now()),false);
});
test('conference ladders keep distinct links and out-of-season ladders disappear', () => {
    const nba={...season,seasonLabel:'2026-27',standings:[{id:'east',label:'Eastern Conference',rows:[{rank:1,team:{name:'East'},wins:5,losses:1}]},{id:'west',label:'Western Conference',rows:[{rank:1,team:{name:'West'},wins:4,losses:2}]}]};
    assert.deepEqual(cardsFor({nba},Date.parse('2026-11-01')).map(c=>c.title),['NBA East','NBA West']);
    assert.match(cardsFor({nba},Date.parse('2026-11-01'))[1].href,/standing=west/);
    assert.equal(cardsFor({nba},Date.parse('2027-07-01')).length,0);
});


test('completed playoffs start the grace period from the final rather than the broad calendar end', () => {
 const data={...season,groups:[{matches:[{startTime:'2027-06-10T00:00:00Z',roundLabel:'Postseason',status:'final'}]}]};
 assert.equal(isSeasonVisible(data,Date.parse('2027-06-19')),true);
 assert.equal(isSeasonVisible(data,Date.parse('2027-06-21')),false);
});


test('only two distinct sports closest to their season end are selected', () => {
 const {chooseLadders}=require('../home-ladders.js');
 const now=Date.parse('2026-11-04');
 const cards=[{sport:'nba',id:'east',seasonEnd:now+200*86400000},{sport:'nba',id:'west',seasonEnd:now+200*86400000},{sport:'f1',id:'wdc',seasonEnd:now+30*86400000},{sport:'f1',id:'wcc',seasonEnd:now+30*86400000},{sport:'nfl',id:'afc',seasonEnd:now+90*86400000}];
 const selected=chooseLadders(cards,now,2);
 assert.deepEqual(selected.map(s=>s.sport),['f1','nfl']);
 assert.deepEqual(selected[0].views.map(v=>v.id),['wdc','wcc']);
});

test('either opposite view can be picked randomly without changing sports selection', () => {
 const {randomView}=require('../home-ladders.js');
 const views=[{id:'east'},{id:'west'}];
 assert.equal(randomView(views,()=>0).id,'east');
 assert.equal(randomView(views,()=>.999).id,'west');
 assert.equal(randomView([views[0]],()=>.5).id,'east');
});


test('six ladders prefer men’s leagues and order each group by season finish', () => {
 const {chooseLadders}=require('../home-ladders.js');
 const now=Date.parse('2026-11-04');
 const sports=['wnba','aflw','nrlw','nba','nfl','nbl','f1'];
 const cards=sports.map((sport,i)=>({sport,id:sport,seasonEnd:now+(i+1)*86400000}));
 const chosen=chooseLadders(cards,now);
 assert.equal(chosen.length,6);
 assert.deepEqual(chosen.map(s=>s.sport),['nba','nfl','nbl','f1','wnba','aflw']);
});
