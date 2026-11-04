const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const view = require('../sport-view.js');

test('AFL adaptation preserves match identity, missing scores and zero scores while resolving club aliases', () => {
    const result = view.normalizeAFL([{round:0,matches:[
        {matchId:100,homeTeam:'Sydney',awayTeam:'Carlton',status:'CONCLUDED',homeScore:12,awayScore:0,startTime:'2026-03-05T08:30:00.000+0000'},
        {matchId:101,homeTeam:'Geelong',awayTeam:'Gold Coast',status:'SCHEDULED',homeScore:null,awayScore:null,startTime:null}
    ]}], {afl:{sydneyswans:{name:'Sydney Swans',image:'https://example.com/sydney.png'}}});
    assert.equal(result.season,2026);
    assert.equal(result.groups[0].label,'Opening Round');
    const [finished,future] = result.groups[0].matches;
    assert.equal(finished.id,'100');
    assert.equal(finished.home.id,'sydneyswans');
    assert.equal(finished.home.name,'Sydney Swans');
    assert.equal(finished.awayScore,0);
    assert.equal(finished.winner,'home');
    assert.equal(finished.startTime,'2026-03-05T08:30:00.000Z');
    assert.equal(future.home.id,'geelongcats');
    assert.equal(future.away.id,'goldcoastsuns');
    assert.equal(future.homeScore,null);
    assert.equal(future.winner,null);
    assert.equal(view.normalizeAFL([]).season,null);
});

test('team overview respects home and away results, draws, missing scores and excludes ongoing games', () => {
    const home={id:'home',name:'Home'}, away={id:'away',name:'Away'};
    const games = [
        {id:'one',home,away,status:'final',homeScore:10,awayScore:0,winner:'home',startTime:'2026-11-01T10:00:00Z'},
        {id:'two',home:away,away:home,status:'final',homeScore:7,awayScore:5,winner:'home',startTime:'2026-11-02T10:00:00Z'},
        {id:'three',home,away,status:'final',homeScore:3,awayScore:3,winner:null,startTime:'2026-11-03T10:00:00Z'},
        {id:'four',home,away,status:'final',homeScore:null,awayScore:null,winner:null,startTime:'2026-11-04T10:00:00Z'},
        {id:'live',home,away,status:'live',homeScore:50,awayScore:1,winner:'home',startTime:'2026-11-05T10:00:00Z'}
    ];
    const result = view.teamSummary(games,'home');
    assert.equal(result.played,4);
    assert.equal(result.wins,1);
    assert.equal(result.losses,1);
    assert.equal(result.draws,1);
    assert.equal(result.scored,18);
    assert.equal(result.conceded,10);
    assert.equal(result.scoredGames,3);
    assert.equal(result.best.match.id,'one');
    assert.equal(result.best.margin,10);
    assert.deepEqual(result.form,['W','L','D','—']);
    assert.deepEqual(view.teamSummary(games,'absent').form,[]);
});

test('player aggregation uses recorded samples for averages, preserves zeros and isolates traded teams', () => {
    const categories=[{key:'points',label:'Points'},{key:'assists',label:'Assists'}];
    const player=(teamId,points,assists)=>({id:'p1',name:'Ada',teamId,teamName:`Club ${teamId}`,stats:{points,assists}});
    const records=[{players:[player('A',10,0),player('A',999,999)]},{players:[player('A',20,null)]},{players:[player('B',5,2)]}];
    const totals=view.aggregate(records,categories);
    assert.deepEqual(totals[0].players.map(player=>[player.teamId,player.value,player.sample]),[['A',30,2],['B',5,1]]);
    const average=view.aggregate(records,categories,{team:'A',mode:'average'});
    assert.equal(average[0].players[0].value,15);
    assert.equal(average[0].players[0].appearances,2);
    assert.equal(average[1].players[0].value,0);
    assert.equal(average[1].players[0].sample,1);
    assert.equal(view.aggregate(records,categories,{team:'Unknown'})[0].players.length,0);
});

test('leaderboards use the top six with deterministic names for tied values and label unrecorded categories', () => {
    const categories=[{key:'points',label:'Points'},{key:'missing',label:'Unavailable stat'}];
    const records=[{players:Array.from({length:8},(_,index)=>({id:String(index+1),name:`Player ${index}`,teamId:'A',teamName:'Club',stats:{points:8-index}}))}];
    const boards=view.aggregate(records,categories);
    assert.equal(boards[0].players.length,6);
    assert.equal(boards[0].players[0].value,8);
    assert.equal(boards[0].players[5].value,3);
    assert.match(view.leadersMarkup({categories},records),/No recorded performances yet/);
    assert.match(view.leadersMarkup(null,[]),/not been published/);
});

test('team and match URLs encode provider identifiers as query values', () => {
    const url=new URL(view.teamUrl('nba',{id:'x&match="evil"'}),'https://example.com');
    assert.equal(url.pathname,'/sport-view.html');
    assert.equal(url.searchParams.get('sport'),'nba');
    assert.equal(url.searchParams.get('team'),'x&match="evil"');
    assert.equal(url.searchParams.has('match'),false);
    const match=new URL(view.matchUrl('afl',{matchId:8041}),'https://example.com');
    assert.equal(match.searchParams.get('match'),'8041');
});

test('all-time dashboards identify archive coverage and keep historical honours separate from season player data',()=>{
    const archive={coverage:{from:2012,to:2026,note:'Official archive starts in 2012.'},teams:{Melbourne:{name:'Melbourne',played:300,wins:150,losses:148,draws:2,from:2012,to:2026,seasons:15,achievements:[{year:2021,label:'Premiership <verified>'}],history:[{year:2021,played:22,wins:17,losses:4,draws:1,rank:1}],bestSeason:{year:2021,wins:17,played:22}}}};
    const html=view.careerMarkup({sport:'afl'},{id:'melbourne',name:'Melbourne'},archive);
    assert.match(html,/All time/);
    assert.match(html,/2012–2026/);
    assert.match(html,/Official archive starts in 2012/);
    assert.match(html,/Premiership &lt;verified&gt;/);
    assert.match(html,/Historical records are separate from the season player statistics/);
    assert.match(html,/Browse 1 recorded seasons/);
    assert.match(view.careerMarkup({sport:'nba'},{id:'missing',name:'Unknown'},archive),/not available in the saved archive/);
});

test('leader and individual-performance markup escapes provider text and distinguishes zero from missing', () => {
    const categories=[{key:'points',label:'<Points>'},{key:'assists',label:'Assists'}];
    const record={id:'one',players:[{id:'p1',name:'<img src=x onerror=alert(1)>',teamName:'A & "B"',teamId:'A',stats:{points:0,assists:null}}]};
    const leaders=view.leadersMarkup({categories},[record]);
    assert.match(leaders,/&lt;img/);
    assert.match(leaders,/&lt;Points&gt;/);
    assert.doesNotMatch(leaders,/<img/);
    const markup=view.matchPerformance({categories,matches:{one:record}},{id:'one',status:'final'});
    assert.match(markup,/<td>0<\/td>/);
    assert.match(markup,/<td>—<\/td>/);
    assert.doesNotMatch(markup,/<img/);
    assert.match(view.matchPerformance(null,{id:'future',status:'scheduled'}),/after play begins/);
    assert.match(view.matchPerformance(null,{id:'missing',status:'final'}),/not available/);
});

test('each saved league team and game identity is usable and player records match a fixture participant', () => {
    for (const sport of ['aflw','nrl','nrlw','nba','wnba','nbl','nfl']) {
        const snapshot=JSON.parse(fs.readFileSync(new URL(`../sports-data/${sport}.json`, `file://${__filename.replaceAll('\\','/')}`),'utf8'));
        const stats=JSON.parse(fs.readFileSync(new URL(`../sports-data/${sport}-players.json`, `file://${__filename.replaceAll('\\','/')}`),'utf8'));
        for (const group of snapshot.groups) for (const match of group.matches) {
            const record=stats.matches[match.id];
            if (!record) continue;
            assert.ok(match.id,`${sport} match has identity`);
            const participants=[String(match.home.id),String(match.away.id)];
            for (const player of record.players) assert.ok(participants.includes(String(player.teamId)),`${sport}: ${player.name} belongs to a fixture participant`);
        }
    }
});
