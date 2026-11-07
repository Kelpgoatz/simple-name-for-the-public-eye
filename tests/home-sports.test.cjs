const test = require('node:test');
const assert = require('node:assert/strict');
const {summaries, renderCard} = require('../home-sports.js');
const match = {id:'1', startTime:'2026-11-04T22:00:00Z',status:'scheduled',home:{name:'Home',abbreviation:'H'},away:{name:'Away',abbreviation:'A'},homeScore:0,awayScore:0};
const snapshot = m => ({sport:'nba',groups:[{id:'2026-11-05',label:'Thursday',matches:[m]}]});

test('odd league groups feature the closest game first without changing other order or F1', () => {
    const {leagueLayout} = require('../home-sports.js');
    const games = [1,2,3].map(day => ({startTime:new Date(`2026-11-0${day}T10:00:00Z`)}));
    const now = Date.parse('2026-11-02T11:00:00Z');
    for (const sport of ['afl','nba','nfl','nrl','tennis']) {
        const result = leagueLayout(games, sport, now);
        assert.equal(result.expanded, games[1]);
        assert.deepEqual(result.games, [games[1], games[0], games[2]]);
    }
    assert.deepEqual(leagueLayout(games,'f1',now), {games,expanded:null});
    assert.equal(leagueLayout(games.slice(0,2),'nba',now).expanded, null);
    assert.equal(leagueLayout([games[0]],'nba',now).expanded, games[0]);
    assert.deepEqual(games.map(game=>game.startTime.getUTCDate()), [1,2,3]);
});

test('women’s leagues render in their own homepage categories with league-specific links', () => {
    for (const sport of ['aflw', 'nrlw', 'wnba']) {
        const games = summaries({...snapshot(match), sport});
        assert.equal(games.length, 1);
        assert.equal(games[0].sport, sport);
        assert.match(renderCard(games[0]), new RegExp(`${sport}.html\\?group=`));
    }
});

test('homepage sports use Sydney dates and ignore unavailable start times', () => {
    assert.equal(summaries(snapshot(match))[0].dateKey,'2026-11-05');
    assert.equal(summaries(snapshot({...match,startTime:null})).length,0);
});
test('old provider live flags cannot pull archived games into Today', () => {
    const game=summaries(snapshot({...match,status:'live'}),Date.parse('2027-01-01'))[0];
    assert.equal(game.active,false);
    assert.match(renderCard(game),/Update pending/);
});

test('a stale scheduled game is labelled awaiting an update without inventing a result',()=>{
    const game=summaries(snapshot({...match,startTime:'2026-11-04T00:00:00Z'}),Date.parse('2026-11-04T12:00:00Z'))[0];
    assert.equal(game.state.isPending,true);
    assert.equal(game.state.isFinished,false);
    assert.match(renderCard(game),/Update pending/);
    assert.doesNotMatch(renderCard(game),/score-value--win/);
});

test('only fresh provider live scores show a live period and score', () => {
    const now = Date.parse('2026-11-04T23:15:00Z');
    const data = snapshot({...match,status:'live',statusDetail:'Q3 · 2:10',homeScore:101,awayScore:98});
    const fresh = {...data,fixturesUpdatedAt:'2026-11-04T23:00:00Z'};
    assert.match(renderCard(summaries(fresh, now)[0]),/Live.*Q3 · 2:10/);
    for (const game of [summaries(fresh, now, {stale:true})[0], summaries({...data,fixturesUpdatedAt:'2026-11-04T22:15:00Z'}, now)[0]]) {
        assert.equal(game.active, false);
        assert.match(renderCard(game),/Update pending/);
        assert.doesNotMatch(renderCard(game),/Q3 · 2:10|>101</);
    }
});

test('Sydney weeks switch on local Monday and duplicate source matches use the latest revision', () => {
    const { weekRange } = require('../home-sports.js');
    assert.deepEqual(weekRange(Date.parse('2026-11-01T12:59:00Z')), {start:'2026-10-26',end:'2026-11-01'});
    assert.deepEqual(weekRange(Date.parse('2026-11-01T13:00:00Z')), {start:'2026-11-02',end:'2026-11-08'});
    const data = snapshot({...match,updatedAt:'2026-11-04T20:00:00Z'});
    data.groups.push({id:'rescheduled',matches:[{...match,startTime:'2026-11-05T22:00:00Z',updatedAt:'2026-11-04T21:00:00Z'}]});
    const games = summaries(data, Date.parse('2026-11-04T21:05:00Z'));
    assert.equal(games.length, 1);
    assert.equal(games[0].group.id, 'rescheduled');
});
test('league cards share AFL layout and link to the exact fixture group', () => {
    const card=renderCard(summaries(snapshot(match))[0]);
    assert.match(card,/class="afl-game home-sport-game"/);
    assert.match(card,/nba.html\?group=2026-11-05/);
    assert.doesNotMatch(card,/score-value--loss">0/);
    const final=renderCard(summaries(snapshot({...match,status:'final',homeScore:0,awayScore:2,winner:'away'}))[0]);
    assert.match(final,/score-value--loss">0/);
    assert.match(final,/score-value--win">2/);
});
test('card content escapes provider text and ignores unsafe logo URLs', () => {
    const card=renderCard(summaries(snapshot({...match,home:{name:'<script>',logo:'javascript:alert(1)'}}))[0]);
    assert.match(card,/&lt;script&gt;/);
    assert.doesNotMatch(card,/javascript:|<script>/);
});



test('Today is within three hours, with rolling Upcoming limits for NBA and other leagues', () => {
 const {dayCategory}=require('../home-sports.js');
 const now=Date.parse('2026-11-04T12:00:00Z');
 const game=(hours,sport='nba')=>({sport,startTime:new Date(now+hours*3600000),dateKey:'2026-11-05',state:{isFinished:false}});
 assert.equal(dayCategory(game(.5),now),'today');
 assert.equal(dayCategory(game(3),now),'today');
 assert.equal(dayCategory(game(3.1),now),'upcoming');
 assert.equal(dayCategory(game(16),now),'upcoming');
 assert.equal(dayCategory(game(16.1),now),null);
 assert.equal(dayCategory(game(24,'nfl'),now),'upcoming');
 assert.equal(dayCategory(game(24.1,'nfl'),now),null);
});

test('live games remain visible; stale live flags and old NBA results are excluded', () => {
 const {dayCategory}=require('../home-sports.js');
 const now=Date.parse('2026-11-04T14:00:00Z');
 const game={sport:'nba',dateKey:'2026-11-04',startTime:new Date(now-2*3600000),state:{isLive:true,isFinished:false}};
 assert.equal(dayCategory(game,now),'today');
 assert.equal(dayCategory({...game,startTime:new Date(now-50*3600000)},now),null);
 assert.equal(dayCategory({...game,startTime:new Date(now-17*3600000),state:{isFinished:true}},now),null);
 assert.equal(dayCategory({...game,sport:'nfl',startTime:new Date(now-17*3600000),state:{isFinished:true}},now),'yesterday');
});
