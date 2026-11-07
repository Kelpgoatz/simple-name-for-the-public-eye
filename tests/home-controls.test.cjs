const test=require('node:test');
const assert=require('node:assert/strict');
const controls=require('../home-controls.js');
test('homepage status filters use provider state and keep a countdown out of Live',()=>{
    const { eventType } = require('../home-sports.js');
    const { aflState } = require('../home-welcome.js');
    const now = Date.parse('2026-11-06T00:00:00Z');
    const inFiveMinutes = new Date(now + 5 * 60000);
    const countdown = aflState({status:'SCHEDULED'}, inFiveMinutes, now);
    assert.equal(countdown.isCountdown, true);
    assert.equal(eventType({startTime:inFiveMinutes,state:countdown},now),'upcoming');
    const started = new Date(now - 60000);
    for (const [status, stale, type] of [['LIVE', false, 'live'], ['LIVE', true, 'other'], ['CONCLUDED', false, 'results'], ['SCHEDULED', false, 'other'], ['POSTPONED', false, 'other']]) {
        assert.equal(eventType({startTime:started,state:aflState({status},started,now,{stale})},now),type);
    }
});
test('game filters combine league and type without changing the underlying selection',()=>{
    const games=[{sport:'f1',type:'results'},{sport:'f2',type:'upcoming'},{sport:'f3',type:'results'},{sport:'nba',type:'live'},{sport:'nba',type:'other'}];
    assert.equal(games.filter(game=>controls.matchesFilter(game,{})).length,5);
    assert.equal(games.filter(game=>controls.matchesFilter(game,{type:'results'})).length,2);
    assert.deepEqual(games.filter(game=>controls.matchesFilter(game,{type:'results',league:'f3'})),[{sport:'f3',type:'results'}]);
    assert.equal(games.filter(game=>controls.matchesFilter(game,{type:'live',league:'f1'})).length,0);
    assert.equal(games.length,5);
});
test('counts include unavailable games in All without presenting them as live, upcoming or results',()=>{
    const games=[{sport:'f1',type:'results'},{sport:'nba',type:'live'},{sport:'nba',type:'upcoming'},{sport:'nba',type:'other'}];
    assert.deepEqual(controls.counts(games),{all:4,live:1,upcoming:1,results:1});
    assert.deepEqual(controls.counts(games,'nba'),{all:3,live:1,upcoming:1,results:0});
    assert.deepEqual(controls.counts([],''),{all:0,live:0,upcoming:0,results:0});
});
