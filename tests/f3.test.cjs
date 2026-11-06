const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const view=require('../f3.js');
const source=import('../scripts/lib/f3-source.mjs');

test('F3 profiles use only their own current-season race entries and preserve official classification positions',()=>{
    const row=(id,team,pos,points)=>({driverId:id,teamId:team,positionNumber:pos,points,laps:20});
    const data={races:[{round:1,sessions:[{type:'Qualifying',results:[row('a','one',1,null)]},{type:'Race',results:[row('a','one',2,8),row('b','one',1,10),row('c','two',3,6)]}]}]};
    const driver=view.profileSummary(data,{type:'driver',id:'a'}),team=view.profileSummary(data,{type:'team',id:'one'});
    assert.equal(driver.starts,1);assert.equal(driver.points,8);assert.equal(driver.podiums,1);
    assert.equal(team.starts,2);assert.equal(team.points,18);assert.equal(team.wins,1);
});
test('F3 driver nationalities use published profile labels including countries outside the F2 grid',async()=>{
    const {officialNationality}=await source;
    assert.equal(officialNationality('<title>Flag of Sri Lanka</title>').countryCode,'lk');
    assert.equal(officialNationality('<title>Flag of People’s Republic of China</title>').countryCode,'cn');
    assert.equal(officialNationality('<title>Flag of Republic of Korea</title>').countryCode,'kr');
    assert.equal(officialNationality('<title>Flag of an unknown country</title>'),null);
});
test('F3 fastest-lap ordering keeps race positions and points while timing gaps use lap times',()=>{
    const session={type:'Race',label:'Sprint Race',results:[
        {driverId:'a',teamId:'t',name:'A',teamName:'T',position:1,positionNumber:1,points:10,bestLap:'1:21.500',gap:'0',number:'1'},
        {driverId:'b',teamId:'t',name:'B',teamName:'T',position:2,positionNumber:2,points:8,bestLap:'1:20.000',gap:'2.000',number:'2'}
    ]};
    const html=view.resultsMarkup({round:3},session,null,{order:'fastest',gap:'leader'});
    assert.ok(html.indexOf('driver=b')<html.lastIndexOf('driver=a'));
    assert.match(html,/Fastest lap order/);assert.match(html,/feeder-fastest-time/);
    assert.match(html,/<td>2<\/td>/);assert.match(html,/<td>8<\/td>/);assert.match(html,/\+1\.500/);
    const controls=view.controlsMarkup(session,{gap:'interval',order:'fastest'});
    assert.match(controls,/data-f3-gap="interval" aria-pressed="true"/);
    assert.match(controls,/data-f3-order="fastest" aria-pressed="true"/);
});
test('F3 practices default to leader gaps without race-only controls or invented grid positions',()=>{
    const session={type:'Practice',label:'Practice',results:[{driverId:'a',teamId:'t',name:'<Driver>',teamName:'T',position:1,positionNumber:1,bestLap:'1:20.000',laps:15}]};
    const controls=view.controlsMarkup(session),html=view.resultsMarkup({round:1},session);
    assert.match(controls,/data-f3-gap="leader" aria-pressed="true"/);
    assert.doesNotMatch(controls,/Fastest lap order/);assert.doesNotMatch(html,/>Grid</);
    assert.match(html,/&lt;Driver&gt;/);assert.doesNotMatch(html,/<Driver>/);
});
test('the saved F3 season uses unique source identities and verified flags for every published driver',()=>{
    const data=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'..','f3-data.json'),'utf8'));
    assert.equal(new Set(data.drivers.map(row=>row.id)).size,data.drivers.length);
    assert.equal(new Set(data.teams.map(row=>row.id)).size,data.teams.length);
    assert.ok(data.races.length>0);assert.equal(data.coverage.complete,true);
    for(const driver of data.drivers){assert.match(driver.flagUrl,/^https:\/\/flagcdn\.com\/w160\/[a-z]{2}\.png$/);assert.match(driver.nationalitySource,/^https:\/\/www\.fiaformula3\.com\/en\/drivers\//);}
    assert.match(fs.readFileSync(require('node:path').join(__dirname,'..','f3.html'),'utf8'),/src="feeder-results.js"/);
});
