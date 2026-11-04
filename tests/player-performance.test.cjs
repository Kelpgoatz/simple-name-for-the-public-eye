const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../scripts/lib/player-performance.mjs');
const fixture={id:'1',home:{id:'H',name:'Home'},away:{id:'A',name:'Away'}};
const espn=(sections)=>({header:{id:'1',season:{year:2026}},boxscore:{players:['H','A'].map(id=>({team:{id},statistics:sections(id)}))}});

test('basketball box scores retain numeric zero, split made three-pointers, and exclude DNP players',async()=>{
    const {normalizeEspnPlayers}=await api;
    const payload=espn(id=>[{keys:['points','rebounds','threePointFieldGoalsMade-threePointFieldGoalsAttempted','assists'],athletes:[
        {athlete:{id,displayName:`Player ${id}`},stats:['0','5','3-7','—']},
        {athlete:{id:id+'bench',displayName:'Did not play'},didNotPlay:true,stats:['0','0','0-0','0']}
    ]}]);
    const rows=normalizeEspnPlayers(payload,fixture,'nba',2026);
    assert.equal(rows.length,2);
    assert.equal(rows[0].stats.points,0);
    assert.equal(rows[0].stats.threePointFieldGoalsMade,3);
    assert.equal(rows[0].stats.assists,null);
    assert.equal(rows[0].stats.blocks,null);
    assert.throws(()=>normalizeEspnPlayers(payload,{...fixture,id:'other'},'nba',2026),/event or season/);
    assert.throws(()=>normalizeEspnPlayers(payload,fixture,'nba',2027),/event or season/);
    assert.throws(()=>normalizeEspnPlayers({...payload,boxscore:{players:payload.boxscore.players.slice(0,1)}},fixture,'nba',2026),/both teams/);
});

test('NFL combines categories for the same athlete without inventing unreported statistics',async()=>{
    const {normalizeEspnPlayers}=await api;
    const payload=espn(id=>[
        {name:'passing',keys:['completions/passingAttempts','passingYards','yardsPerPassAttempt','passingTouchdowns'],athletes:[{athlete:{id,displayName:id},stats:['10/12','125','10.4','1']}]},
        {name:'rushing',keys:['rushingAttempts','rushingYards','yardsPerRushAttempt','rushingTouchdowns'],athletes:[{athlete:{id,displayName:id},stats:['3','-4','-1.3','0']}]}
    ]);
    const rows=normalizeEspnPlayers(payload,fixture,'nfl',2026);
    assert.equal(rows.length,2);
    assert.equal(rows[0].stats.passingYards,125);
    assert.equal(rows[0].stats.rushingYards,-4);
    assert.equal(rows[0].stats.rushingTouchdowns,0);
    assert.equal(rows[0].stats.totalTackles,null);
});

test('NRL embedded match data is parsed as JSON and only named participants with matching teams are imported',async()=>{
    const {parseNrlMatch,normalizeNrlPlayers}=await api;
    const payload={homeTeam:{teamId:'H',players:[{playerId:1,firstName:'Home',lastName:'Player'}]},awayTeam:{teamId:'A',players:[{playerId:2,firstName:'Away',lastName:'Player'}]},stats:{players:{homeTeam:[{playerId:1,minutesPlayed:80,points:0,allRunMetres:120},{playerId:99,minutesPlayed:80,points:10}],awayTeam:[{playerId:2,minutesPlayed:40,points:4,tries:1}]}}};
    const encoded=JSON.stringify({match:payload}).replaceAll('&','&amp;').replaceAll('"','&quot;');
    assert.deepEqual(parseNrlMatch(`<div id="vue-match-centre" q-data="${encoded}"></div>`),payload);
    const rows=normalizeNrlPlayers(payload,fixture,'nrl');
    assert.equal(rows.length,2);
    assert.equal(rows[0].stats.points,0);
    assert.equal(rows[0].stats.allRunMetres,120);
    assert.equal(rows[0].stats.tacklesMade,null);
    assert.throws(()=>normalizeNrlPlayers({...payload,awayTeam:{teamId:'other'}},fixture,'nrl'),/do not match/);
    assert.throws(()=>parseNrlMatch('<script>arbitrary()</script>'),/not published/);
});

test('AFLW player identity is converted to the normalized fixture team ID',async()=>{
    const {normalizeAflPlayers,categories}=await api;
    const match={home:{team:{id:21,providerId:'H',name:'Home'}},away:{team:{id:22,providerId:'A',name:'Away'}}};
    const row=(id,teamId)=>({teamId,playerStats:{player:{playerId:id,playerName:{givenName:'Player',surname:id}},stats:{disposals:10,goals:0,clearances:{totalClearances:2}}}});
    const rows=normalizeAflPlayers({homeTeamPlayerStats:[row('1','H')],awayTeamPlayerStats:[row('2','A')]},match);
    assert.equal(rows[0].teamId,'21');
    assert.equal(rows[0].stats.clearances,2);
    for(const sport of ['afl','aflw','nrl','nrlw','nba','wnba','nbl','nfl']) assert.equal(categories(sport).length,8);
});
