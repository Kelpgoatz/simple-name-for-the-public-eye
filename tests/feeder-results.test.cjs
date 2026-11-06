const test=require('node:test');
const assert=require('node:assert/strict');
const timing=require('../feeder-results.js');
const source=import('../scripts/lib/fia-feeder-classifications.mjs');
test('feeder fastest-lap order preserves positions and points while gaps compare lap times',()=>{
    const session={type:'Race',results:[{driverId:'a',position:1,points:25,bestLap:'1:20.500',gap:'0'},{driverId:'b',position:2,points:18,bestLap:'1:20.000',gap:'5.000'},{driverId:'c',position:3,points:15,bestLap:'1:21.100',gap:'9.000'},{driverId:'d',position:4,points:12,bestLap:null}]};
    const rows=timing.rows(session,{order:'fastest',gap:'interval'});
    assert.deepEqual(rows.map(row=>row.driverId),['b','a','c','d']);
    assert.equal(rows[0].position,2);assert.equal(rows[0].points,18);assert.equal(rows[0].isFastest,true);
    assert.deepEqual(rows.map(row=>row.gapText),['Fastest','+0.500','+0.600','—']);
    assert.equal(timing.rows(session,{order:'fastest',gap:'leader'})[2].gapText,'+1.100');
    assert.equal(session.results[0].driverId,'a');
});
test('race intervals and practice leader gaps use their own defaults without inventing lap times',()=>{
    assert.equal(timing.defaultGap({type:'Race'}),'interval');assert.equal(timing.defaultGap({type:'Qualifying'}),'leader');
    const race={type:'Race',results:[{gap:'0'},{gap:'2.300'},{gap:'3.500'},{gap:'DNF'}]};
    assert.deepEqual(timing.rows(race).map(row=>row.gapText),['Interval','+2.300','+1.200','DNF']);
    assert.equal(timing.hasFastestLaps(race),false);
    assert.equal(timing.lapSeconds('DNF'),null);assert.equal(timing.lapSeconds('0'),null);
});
test('FIA table enrichment matches explicit car and driver identity and retains corrected API results',async()=>{
    const {parseClassification,enrichRows}=await source;
    const html='<table><tr><td>Pos</td><td>Nr</td><td>Driver</td><td>Best lap</td><td>Best lap lap</td><td>Gap first</td></tr><tr><td>1</td><td>7</td><td><div class="name">A. Example</div><div>GBR</div></td><td>1:20.123</td><td>8</td><td>0</td></tr></table>';
    const parsed=parseClassification(html);assert.equal(parsed[0]['Best lap'],'1:20.123');
    const session={type:'Race',results:[{number:'7',driverId:'a',name:'Alex Example',positionNumber:3,points:15,gap:'5.000'},{number:'9',driverId:'b',name:'Other Driver',bestLap:null}]};
    const result=enrichRows(session,parsed,'https://www.fia.com/example');
    assert.equal(result.results[0].bestLap,'1:20.123');assert.equal(result.results[0].bestLapNumber,8);
    assert.equal(result.results[0].positionNumber,3);assert.equal(result.results[0].points,15);assert.equal(result.results[0].gap,'5.000');
    assert.equal(result.results[1].bestLap,null);assert.equal(result.timingCoverage.matched,1);
    assert.equal(enrichRows({...session,results:[{...session.results[0],name:'Wrong Identity'}]},parsed,'url').timingCoverage.matched,0);
});

test('recent completed feeder sessions refresh to pick up official corrections before entering the older-result cache',async()=>{
    const {canReuseSession}=await source,now=Date.parse('2026-11-06T12:00:00Z');
    const cached={results:[{driverId:'a'}],startTime:'2026-11-05T12:00:00Z',updatedAt:'2026-11-06T11:00:00Z'};
    assert.equal(canReuseSession({state:'completed'},cached,now),false);
    assert.equal(canReuseSession({state:'completed'},{...cached,startTime:'2026-09-01T12:00:00Z'},now),true);
    assert.equal(canReuseSession({state:'completed'},{...cached,startTime:'2026-09-01T12:00:00Z',updatedAt:'2026-10-01T12:00:00Z'},now),false);
    assert.equal(canReuseSession({state:'live'},cached,now),false);
});
