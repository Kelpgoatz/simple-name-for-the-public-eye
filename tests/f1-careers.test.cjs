const test=require('node:test');
const assert=require('node:assert/strict');
const source=import('../scripts/lib/f1-career-data.mjs');
const ui=require('../f1-profile.js');
const result=(season,round,position,extra={})=>({season,round,position,positionText:String(position),driverId:'driver',driverName:'Driver Name',constructorId:'team',race:`Race ${round}`,grid:position,points:25,status:'Finished',...extra});

test('career records count GP starts separately from DNS and completed championships separately from current leaders',async()=>{
    const {summarizeCareer}=await source;
    const career=summarizeCareer({kind:'driver',sourceId:'driver',sourceName:'Driver',season:2026,results:[result(2025,1,1),result(2025,2,2),result(2025,3,20,{positionText:'R',status:'Engine'}),result(2025,4,21,{positionText:'W',status:'Did not start'}),result(2026,1,1)],standings:[{season:2025,position:1},{season:2026,position:1}]});
    assert.equal(career.totals.entries,5);
    assert.equal(career.totals.starts,4);
    assert.equal(career.totals.wins,2);
    assert.equal(career.totals.podiums,3);
    assert.equal(career.totals.titles,1);
    assert.deepEqual(career.titleYears,[2025]);
    assert.equal(career.averages.finish,4/3);
    assert.equal(career.seasons[0].complete,false);
});

test('constructor careers count race weekends once and shared-car podium classifications once',async()=>{
    const {summarizeCareer}=await source;
    const rows=[result(1954,1,1),result(1954,1,1,{driverId:'shared'}),result(1954,1,3,{driverId:'other'}),result(1954,2,5),result(1954,2,6,{driverId:'other'})];
    const career=summarizeCareer({kind:'team',sourceId:'team',sourceName:'Exact Constructor',season:2026,results:rows,standings:[{season:2025,position:2}]});
    assert.equal(career.totals.starts,2);
    assert.equal(career.totals.wins,1);
    assert.equal(career.totals.podiums,2);
    assert.match(career.scope,/not merged/);
    assert.equal(career.bestChampionship.position,2);
    assert.equal(career.bestResult.season,1954);
    const shared=summarizeCareer({kind:'team',sourceId:'team',sourceName:'Team',season:2026,results:[result(1954,1,1),result(1954,1,3),result(1954,1,2,{driverId:'other'})]});
    assert.equal(shared.totals.podiums,3);
    assert.equal(shared.totals.starts,1);
    assert.equal(shared.averages.finish,2);
});

test('historical normalizer rejects mismatched identities and retains source names, seasons and status',async()=>{
    const {normalizeRaces}=await source;
    const payload={MRData:{RaceTable:{Races:[{season:'2025',round:'1',raceName:'Australian Grand Prix',date:'2025-03-16',Results:[{Driver:{driverId:'driver',givenName:'Driver',familyName:'Name'},Constructor:{constructorId:'team'},position:'1',positionText:'1',grid:'0',points:'25',status:'Finished'}]}]}}};
    const row=normalizeRaces(payload,'driver','driver')[0];
    assert.equal(row.season,2025);
    assert.equal(row.grid,null);
    assert.equal(row.driverName,'Driver Name');
    assert.throws(()=>normalizeRaces(payload,'team','predecessor'),/identity mismatch/);
    assert.throws(()=>normalizeRaces({},'driver','driver'),/missing/);
});

test('2026 and All time controls show distinct records and never substitute seasonal data when careers are missing',async()=>{
    const {summarizeCareer}=await source;
    const profile=ui.build({kind:'driver',id:'driver',season:2026,drivers:[{driverId:'driver',driver:{name:'Driver',surname:'Name'},position:2,points:20}],races:[]});
    const season=ui.renderMarkup(profile,'total');
    assert.match(season,/data-profile-scope="season" aria-pressed="true"/);
    const missing=ui.renderMarkup(profile,'total',{scope:'all'});
    assert.match(missing,/Historical records.*could not be loaded/);
    assert.doesNotMatch(missing,/GP points \/ driver result/);
    const career=summarizeCareer({kind:'driver',sourceId:'driver',sourceName:'Driver Name',season:2026,results:[result(2025,1,1)],standings:[{season:2025,position:1}],source:'https://api.jolpi.ca/ergast/f1/drivers/driver/results/',updatedAt:'2026-11-04T12:00:00Z'});
    const html=ui.renderMarkup(profile,'total',{scope:'all',career});
    assert.match(html,/Career achievements/);
    assert.match(html,/World Drivers’ Championships/);
    assert.match(html,/2025/);
    assert.match(html,/data-profile-scope="all" aria-pressed="true"/);
    assert.match(ui.href('driver','driver',{scope:'all'}),/scope=all/);
});
