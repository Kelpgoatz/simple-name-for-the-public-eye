const test=require('node:test');
const assert=require('node:assert/strict');
const controls=require('../home-controls.js');
test('homepage game status uses explicit live/results classes and safely handles unavailable states',()=>{
    assert.equal(controls.gameClassification({status:'Live',classes:'afl-game__status'}),'live');
    assert.equal(controls.gameClassification({status:'09:22',classes:'afl-game__status afl-game__status--live'}),'live');
    assert.equal(controls.gameClassification({status:'Finished'}),'results');
    assert.equal(controls.gameClassification({status:'Final'}),'results');
    assert.equal(controls.gameClassification({status:'Practice',classes:'afl-game__status afl-game__status--finished'}),'results');
    assert.equal(controls.gameClassification({status:'Upcoming',upcoming:true}),'upcoming');
    assert.equal(controls.gameClassification({status:'Scheduled'}),'upcoming');
    for(const status of ['Postponed','Cancelled','Update pending','Time to be confirmed',''])assert.equal(controls.gameClassification({status}),'other');
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
