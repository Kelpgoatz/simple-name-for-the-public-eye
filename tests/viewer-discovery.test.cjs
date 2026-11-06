const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const discovery=require('../viewer-discovery.js');
const sources={
    afl:[{matches:[{homeTeam:'Sydney',awayTeam:'Melbourne'}]}],
    aflw:{groups:[{matches:[{home:{id:'24',name:'Melbourne'},away:{id:'25',name:'Winner of QF1'}}]}]},
    nba:{standings:[{rows:[{team:{id:'13',name:'Los Angeles Lakers',abbreviation:'LAL'}}]}],groups:[{matches:[{home:{id:'13',name:'Los Angeles Lakers',abbreviation:'LAL'},away:{id:'2',name:'Boston Celtics'}}]}]},
    f1drivers:{drivers_championship:[{driverId:'hamilton',driver:{name:'Lewis',surname:'Hamilton',shortName:'HAM'},teamId:'ferrari',team:{teamName:'Scuderia Ferrari'}}]},
    f2:{drivers:[{id:'RAFCAM01',name:'Rafael Câmara',teamName:'Invicta Racing',nationality:'Brazil'}],teams:[{id:'674',name:'Invicta Racing'}]},
    f3:{drivers:[{id:'DRIVER03',name:'Test F3 Driver',teamName:'Test F3 Team'}],teams:[{id:'30',name:'Test F3 Team'}]}
};

test('search index groups known leagues and deduplicates provider identities while excluding placeholder opponents',()=>{
    const index=discovery.buildIndex(sources);
    assert.equal(index.filter(entry=>entry.kind==='league').length,12);
    assert.equal(index.filter(entry=>entry.sport==='nba'&&entry.id==='13').length,1);
    assert.equal(index.some(entry=>entry.name.includes('Winner of')),false);
    assert.equal(index.find(entry=>entry.sport==='aflw'&&entry.id==='24').name,'Melbourne Demons Women’s');
    assert.equal(index.find(entry=>entry.sport==='afl'&&entry.id==='sydneyswans').href,'sport-view.html?sport=afl&team=sydneyswans');
    assert.equal(index.find(entry=>entry.sport==='f3'&&entry.kind==='driver').href,'f3.html?driver=DRIVER03');
});

test('search normalizes accented driver names and accepts league, team abbreviation and club nickname tokens',()=>{
    const index=discovery.buildIndex(sources);
    assert.equal(discovery.search(index,'f2 camara')[0].name,'Rafael Câmara');
    assert.equal(discovery.search(index,'nba LAL')[0].name,'Los Angeles Lakers');
    assert.ok(discovery.search(index,'demons').some(entry=>entry.sport==='afl'&&entry.name==='Melbourne'));
    assert.equal(discovery.search(index,'hamilton')[0].id,'hamilton');
    assert.deepEqual(discovery.search(index,'hamilton',{sport:'nba'}),[]);
    assert.deepEqual(discovery.search(index,'hamilton',{sport:'__proto__'}),[]);
});

test('empty search browses competitions, while explicit filters can browse teams and drivers',()=>{
    const index=discovery.buildIndex(sources);
    assert.ok(discovery.search(index,'').every(entry=>entry.kind==='league'));
    assert.ok(discovery.search(index,'',{kind:'driver'}).length>0);
    assert.ok(discovery.search(index,'',{sport:'nba',kind:'team'}).every(entry=>entry.kind==='team'&&entry.sport==='nba'));
    assert.deepEqual(discovery.search(index,'',{kind:'nonexistent'}),[]);
});

test('profile links encode identifiers rather than interpreting supplied query text',()=>{
    const value='driver&id=<bad>';
    const url=new URL(discovery.href('f3','driver',value),'https://example.com');
    assert.equal(url.pathname,'/f3.html');
    assert.equal(url.searchParams.get('driver'),value);
    assert.equal(url.searchParams.has('id'),false);
    assert.equal(discovery.href('__proto__','team','id'),'');
    assert.equal(discovery.href('nba','invalid','id'),'');
});

test('following model uses exact identities and renders escaped provider text with accessible stars',()=>{
    const rows=discovery.following({leagues:['f3','f3','unknown'],teams:[{sport:'aflw',id:'24',name:'Melbourne'},{sport:'aflw',id:'24',name:'Melbourne'}],drivers:[{sport:'f2',id:'x&y',name:'<Driver>'}]});
    assert.equal(rows.length,3);
    assert.equal(rows.find(row=>row.sport==='aflw').name,'Melbourne Demons Women’s');
    const html=discovery.rowMarkup(rows.find(row=>row.kind==='driver'),true);
    assert.match(html,/&lt;Driver&gt;/);
    assert.doesNotMatch(html,/<Driver>/);
    assert.match(html,/aria-pressed="true"/);
    assert.match(html,/Unstar &lt;Driver&gt;/);
    assert.match(html,/driver=x%26y/);
});

test('real saved snapshots produce unique navigable entries for every available current competition',()=>{
    const saved={};
    const files={afl:'afl-fixtures.json',f1drivers:'drivers-championship.json',f1teams:'constructors-championship.json',f2:'f2-data.json',f3:'f3-data.json',...Object.fromEntries(['aflw','nrl','nrlw','nba','wnba','nbl','nfl','tennis'].map(sport=>[sport,`sports-data/${sport}.json`]))};
    for(const [key,file] of Object.entries(files)){const target=path.join(__dirname,'..',file);if(fs.existsSync(target))saved[key]=JSON.parse(fs.readFileSync(target,'utf8'));}
    const entries=discovery.buildIndex(saved);
    assert.equal(new Set(entries.map(entry=>entry.key)).size,entries.length);
    assert.ok(entries.length>250);
    for(const row of entries){assert.ok(row.href);assert.ok(row.name);assert.ok(Object.hasOwn(discovery.labels,row.sport));}
});
