const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../afl-round.js');
const api = import('../scripts/lib/afl-player-stats.mjs');

test('prime-time order follows kickoff times and leaves unknown times last without changing the source', () => {
    const matches = [{id:3,startTime:null},{id:2,startTime:'2026-04-03T09:00:00+0000'},{id:1,startTime:'2026-04-02T09:00:00Z'}];
    assert.deepEqual(view.sortMatches(matches).map(match=>match.id),[1,2,3]);
    assert.deepEqual(matches.map(match=>match.id),[3,2,1]);
});
test('round totals add multiple matches, rank highest first and keep only six players', async () => {
    const {roundLeaders}=await api;
    const players=Array.from({length:8},(_,index)=>({id:String(index),name:`Player ${index}`,teamName:'Club',goals:index,disposals:index*3}));
    const result=roundLeaders([{players},{players:[{...players[0],goals:20,disposals:null}]}]);
    assert.equal(result.goals.length,6);
    assert.equal(result.goals[0].value,20);
    assert.equal(result.disposals[0].value,21);
    assert.equal(result.disposals.find(player=>player.id==='0'),undefined);
    assert.equal(result.handballs.length,0);
});

test('even finals expand the closest dated game besides prime time', () => {
    const matches = [1,2,3,4].map(day => ({startTime:`2026-09-0${day}T09:00:00Z`}));
    const now = Date.parse('2026-09-03T10:00:00Z');
    assert.equal(view.closestFinal(matches, true, now), 2);
    assert.equal(view.closestFinal(matches, false, now), -1);
    assert.equal(view.closestFinal(matches.slice(0,3), true, now), -1);
    assert.equal(view.closestFinal(matches.slice(0,2), true, now), 1);
    assert.equal(view.closestFinal([{startTime:null},{startTime:null}], true, now), 1);
});
test('match normalization uses individual statistics and verifies both fixture teams', async () => {
    const {normalizePlayerStats}=await api;
    const fixture={home:{team:{providerId:'H',name:'Home'}},away:{team:{providerId:'A',name:'Away'}}};
    const row=(id,teamId)=>({teamId,playerStats:{player:{playerId:id,playerName:{givenName:'Test',surname:id}},stats:{disposals:12,kicks:7,handballs:5,goals:0,clearances:{totalClearances:3}}}});
    const payload={homeTeamPlayerStats:[row('1','H')],awayTeamPlayerStats:[row('2','A')]};
    const result=normalizePlayerStats(payload,fixture);
    assert.equal(result[0].goals,0);
    assert.equal(result[0].clearances,3);
    assert.equal(result[0].marks,null);
    assert.throws(()=>normalizePlayerStats({...payload,awayTeamPlayerStats:[row('2','WRONG')]},fixture),/do not match/);
    assert.throws(()=>normalizePlayerStats({...payload,awayTeamPlayerStats:[]},fixture),/unavailable/);
});
test('eight tally cards retain round-specific results and identify incomplete coverage', () => {
    const data={season:2026,rounds:{1:{label:'Round 1',playedMatches:1,complete:false,availableMatches:1,scheduledMatches:9,leaders:{goals:[{name:'<Player>',teamName:'Club',value:4}]}},2:{label:'Round 2',playedMatches:0,complete:true,leaders:{}}}};
    const first=view.renderMarkup(data,1,2026);
    assert.equal((first.match(/class="afl-stat-card"/g)||[]).length,8);
    assert.match(first,/Incomplete coverage/);
    assert.match(first,/&lt;Player&gt;/);
    assert.doesNotMatch(view.renderMarkup(data,2,2026),/&lt;Player&gt;/);
    assert.match(view.renderMarkup(data,2,2026),/once this round begins/);
    assert.doesNotMatch(view.renderMarkup(data,1,2027),/&lt;Player&gt;/);
});
