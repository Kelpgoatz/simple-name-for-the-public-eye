const test=require('node:test');
const assert=require('node:assert/strict');
const api=import('../scripts/lib/team-careers.mjs');

test('historic franchise names may span an archive gap but cannot claim an unrelated earlier club title',async()=>{
    const {historicTeamId}=await api;
    const rows=[{teamId:'lakers',teamName:'Minneapolis Lakers',year:1949},{teamId:'lakers',teamName:'Minneapolis Lakers',year:1951},{teamId:'wizards',teamName:'Baltimore Bullets',year:1964},{teamId:'wizards',teamName:'Washington Wizards',year:2026}];
    assert.equal(historicTeamId(rows,'Minneapolis Lakers',1950),'lakers');
    assert.equal(historicTeamId(rows,'Baltimore Bullets',1948),null);
});

test('historical records deduplicate season IDs, keep both AFLW 2022 seasons, and omit incomplete seasons from best achievements',async()=>{
    const {careerFromHistory}=await api;
    const row=(seasonId,year,wins,losses,complete=true)=>({seasonId,year,wins,losses,draws:0,played:wins+losses,complete});
    const first=row('s6',2022,8,2),second=row('s7',2022,9,1),current=row('2026',2026,1,0,false);
    const result=careerFromHistory([first,second,current,first,{...row('bad',2020,9,1),played:9}],[], 'Archive coverage');
    assert.equal(result.seasons,3);
    assert.equal(result.played,21);
    assert.equal(result.wins,18);
    assert.equal(result.bestSeason.seasonId,'s7');
    assert.equal(result.note,'Archive coverage');
});

test('championships require explicit finals metadata and a completed winning series',async()=>{
    const {championshipFromEspnSummary}=await api;
    const series={type:'playoff',description:'Playoff Series',completed:true,competitors:[{id:'H',wins:4},{id:'A',wins:3}]};
    const payload={header:{season:{year:2025},competitions:[{series:[series],status:{type:{completed:true}},competitors:[{id:'H',winner:true},{id:'A',winner:false}]}]}};
    assert.equal(championshipFromEspnSummary(payload,'nba',2025),null);
    assert.equal(championshipFromEspnSummary({...payload,finalNotes:[{headline:'NBA Eastern Conference Finals - Game 7'}]},'nba',2025),null);
    assert.equal(championshipFromEspnSummary({...payload,finalNotes:[{headline:'NBA Finals - Game 7'}]},'nba',2025).teamId,'H');
    assert.equal(championshipFromEspnSummary({...payload,finalNotes:[{headline:'Super Bowl LIX'}]},'nfl',2025).label,'Super Bowl champion');
    assert.equal(championshipFromEspnSummary({...payload,finalNotes:[{headline:'NBA Finals - Game 7'}]},'nba',2024),null);
});

test('tennis archive counts completed singles results, excludes walkovers and identifies explicit tournament finals',async()=>{
    const {tennisArchiveRows}=await api;
    const match=(id,walkover=false)=>({id,status:{type:{completed:true,name:walkover?'STATUS_WALKOVER':'STATUS_FINAL'}},round:{displayName:'Final'},competitors:[{id:'1',athlete:{displayName:'Winner'},winner:true},{id:'2',athlete:{displayName:'Runner up'},winner:false}]});
    const data={events:[{id:'a',name:'Australian Open',season:{year:2025},groupings:[{grouping:{slug:'mens-singles'},competitions:[match('a'),match('a'),match('b',true)]}]}]};
    const result=tennisArchiveRows(data,'atp',2025);
    assert.equal(result.rows[0].wins,1);
    assert.equal(result.rows[1].losses,1);
    assert.equal(result.achievements.length,1);
    assert.equal(result.achievements[0].label,'Australian Open champion');
    assert.equal(tennisArchiveRows(data,'wta',2025).rows.length,0);
});

test('official title table parser accepts structured year-and-champion facts and rejects broken pages',async()=>{
    const {officialBasketballChampions}=await api;
    const table=Array.from({length:29},(_,i)=>`<tr><td>${2025-i}</td><td>Champion ${i}</td><td>Runner up</td></tr>`).join('');
    assert.equal(officialBasketballChampions(table,'wnba').length,29);
    assert.equal(officialBasketballChampions(table,'wnba')[0].year,2025);
    assert.throws(()=>officialBasketballChampions('<h1>Unavailable</h1>','wnba'),/could not be verified/);
});
