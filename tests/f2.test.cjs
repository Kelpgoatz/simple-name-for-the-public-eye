const test=require('node:test');
const assert=require('node:assert/strict');
const view=require('../f2.js');
const source=import('../scripts/lib/f2-source.mjs');
test('F2 official embedded payload can be read without executing page scripts',async()=>{
    const {embeddedObjects,findObject}=await source;
    const data={meetings:[{meetingKey:1}],standings:[{championshipPoints:0}],category:'Driver'};
    const flight='5:'+JSON.stringify(['$',null,null,{data}])+'\n';
    const html='<script>self.__next_f.push('+JSON.stringify([1,flight])+')</script>';
    assert.deepEqual(findObject(embeddedObjects(html),item=>item.category==='Driver'),data);
    assert.equal(findObject(embeddedObjects('<script>throw new Error()</script>'),()=>true),undefined);
});
test('F2 sessions retain official local offsets, numeric zeroes and incomplete identities',async()=>{
    const {normalizeSession}=await source;
    const session=normalizeSession({value:'f2/race?meeting=1&session=1',shortName:'Sprint Race',sessionType:'Race',startTime:'2026-09-25T08:15:00',gmtOffset:'+04:00',results:[{racingNumber:'20',displayPosition:'17',positionNumber:'17',racePoints:0,lapsCompleted:'21',displayTime:'+27.873s'}]});
    assert.equal(session.startTime,'2026-09-25T04:15:00.000Z');
    assert.equal(session.results[0].points,0);
    assert.equal(session.results[0].name,'Driver #20');
    assert.equal(session.results[0].driverId,null);
});
test('F2 profile aggregates only selected current-season race starts and excludes qualifying',()=>{
    const row=(driverId,teamId,positionNumber,points)=>({driverId,teamId,positionNumber,points,laps:20});
    const data={races:[{round:1,sessions:[{type:'Qualifying',results:[row('d','t',1,99)]},{type:'Race',results:[row('d','t',2,8),row('e','t',1,10),row('x','u',3,6)]},{type:'Race',results:[row('d','t',1,25)]}]}]};
    const driver=view.profileSummary(data,{type:'driver',id:'d'});
    assert.equal(driver.starts,2);assert.equal(driver.points,33);assert.equal(driver.wins,1);assert.equal(driver.best.result.positionNumber,1);
    const team=view.profileSummary(data,{type:'team',id:'t'});
    assert.equal(team.starts,3);assert.equal(team.points,43);assert.equal(team.podiums,3);
});
test('F2 session and round defaults work for future and completed weekends',()=>{
    const races=[{endDate:'2026-10-01'},{endDate:'2026-11-29'}];
    assert.equal(view.initialIndex(races,Date.parse('2026-11-04')),1);
    assert.equal(view.initialIndex(races,Date.parse('2027-01-01')),1);
    assert.equal(view.sessionIndex([{results:[{}]},{results:[]}]),0);
});
test('F2 classifications escape source text and retain podium and profile context',()=>{
    const html=view.resultsMarkup({round:2},{type:'Race',label:'Sprint',results:[{driverId:'d',teamId:'t',name:'<Driver>',teamName:'Club',position:1,positionNumber:1,points:10,laps:20}]},{type:'driver',id:'d'});
    assert.match(html,/&lt;Driver&gt;/);assert.match(html,/f2-selected/);assert.match(html,/data-podium="1"/);assert.match(html,/f2.html\?driver=d&round=2/);
});
