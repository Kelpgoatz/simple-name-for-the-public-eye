const test=require('node:test');
const assert=require('node:assert/strict');
const progress=require('../weekend-progress.js');
const now=Date.parse('2026-11-06T08:00:00Z');

test('weekend progress counts classifications and keeps the selected session separate from up next',()=>{
    const result=progress.build([{key:'p1',label:'P1',startTime:'2026-11-06T06:00:00Z',results:[{}]},{key:'q',label:'Q',startTime:'2026-11-06T10:00:00Z',results:[]},{key:'race',label:'Race',startTime:'2026-11-07T10:00:00Z',results:[]}],{now,selected:'race',timeZone:'Australia/Sydney'});
    assert.equal(result.completed,1);
    assert.equal(result.items[0].state,'complete');
    assert.equal(result.next.key,'q');
    assert.equal(result.next.timestamp,Date.parse('2026-11-06T10:00:00Z'));
    assert.equal(result.items[2].selected,true);
    assert.equal(result.next.selected,false);
    assert.match(progress.summary(result).title,/Up next · Q/);
});

test('elapsed starts and completed feeds without results mean awaiting classification, never live or complete',()=>{
    const result=progress.build([{key:'p1',startTime:'2026-11-06T07:00:00Z',results:[]},{key:'q',state:'completed',startTime:null,results:[]},{key:'race',startTime:'2026-11-07T10:00:00Z',results:[]}],{now});
    assert.equal(result.completed,0);
    assert.equal(result.awaiting.length,2);
    assert.equal(result.next.key,'race');
    assert.ok(result.items.every(item=>!['live','complete'].includes(item.state)));
    const partial=progress.build([{state:'running',startTime:'2026-11-06T07:00:00Z',results:[{}]}],{now});
    assert.equal(partial.completed,0);
    assert.equal(partial.items[0].state,'awaiting');
});

test('published dates without a time stay Time TBC and do not imply a midnight start',()=>{
    const result=progress.build([{key:'p1',date:'2026-11-06',results:[]},{key:'race',date:'2026-11-07',results:[]}],{now,timeZone:'Australia/Sydney'});
    assert.equal(result.next.key,'p1');
    assert.equal(result.next.timestamp,null);
    assert.equal(result.awaiting.length,0);
    assert.match(progress.formatStart(result.next),/Time TBC/);
    assert.doesNotMatch(progress.formatStart(result.next),/12:00|0:00/);
    const earlier=progress.build([{date:'2026-11-05',results:[]}],{now,timeZone:'Australia/Sydney'});
    assert.equal(earlier.items[0].state,'awaiting');
});

test('unknown timetables and cancelled sessions never become the next scheduled start',()=>{
    const result=progress.build([{key:'p1',status:'UNAVAILABLE',results:[]},{key:'q',status:'CANCELLED',startTime:'2026-11-07T10:00:00Z',results:[]}],{now});
    assert.equal(result.next,null);
    assert.equal(result.items[0].state,'unavailable');
    assert.equal(result.items[1].state,'cancelled');
    assert.equal(progress.summary(result).title,'Timetable pending');
    const complete=progress.build([{results:[{}]}],{now});
    assert.equal(progress.summary(complete).title,'Weekend complete');
});

test('weekend timetable formatting uses the requested timezone and escapes feed labels',()=>{
    const result=progress.build([{key:'race',label:'<Race>',startTime:'2026-11-06T22:30:00Z',results:[]}],{now,timeZone:'Australia/Sydney'});
    assert.match(progress.formatStart(result.next,{timeZone:'Australia/Sydney'}),/Sat,? 7 Nov.*9:30/);
    const markup=progress.overviewMarkup(result,{timeZone:'Australia/Sydney'})+progress.tabMarkup(result.next,{timeZone:'Australia/Sydney'});
    assert.match(markup,/Sydney time/);
    assert.match(markup,/&lt;Race&gt;/);
    assert.doesNotMatch(markup,/<Race>/);
});

test('F2 and F3 follow explicit session links while keeping the default latest classification',()=>{
    const sessions=[{id:'f2/practice?meeting=1302&session=0',startTime:'2026-11-06T06:00:00Z',results:[{}]},{id:'f2/qualifying?meeting=1302&session=0',startTime:'2026-11-06T07:00:00Z',results:[{}]},{id:'f2/race?meeting=1302&session=1',startTime:'2026-11-07T10:00:00Z',results:[]}];
    for(const viewer of [require('../f2.js'),require('../f3.js')]){
        assert.equal(viewer.sessionIndex(sessions,now),1);
        assert.equal(viewer.sessionIndex(sessions,now,sessions[0].id),0);
        assert.equal(viewer.sessionIndex(sessions,now,sessions[2].id),2);
        assert.equal(viewer.sessionIndex(sessions,now,'0'),0);
        assert.equal(viewer.sessionIndex(sessions,now,'missing-session'),1);
        assert.equal(viewer.sessionIndex(sessions,now,'99'),1);
    }
});

test('conflicting future session times stay unchanged but are marked provisional for weekend and home cues',()=>{
    const sessions=[{key:'practice',label:'Practice',startTime:'2026-11-07T10:00:00Z',results:[]},{key:'qualifying',label:'Qualifying',startTime:'2026-11-07T10:00:00Z',results:[]},{key:'race',label:'Race',startTime:'2026-11-08T10:00:00Z',results:[]}];
    const before=JSON.stringify(sessions),result=progress.build(sessions,{now});
    assert.equal(result.provisionalTimes,true);
    assert.equal(result.next.key,'practice');
    assert.equal(result.next.provisional,true);
    assert.equal(result.items[1].provisional,true);
    assert.equal(result.items[2].provisional,false);
    assert.equal(result.next.startTime,sessions[0].startTime);
    assert.equal(JSON.stringify(sessions),before);
    assert.match(progress.overviewMarkup(result),/Some session times are provisional/);
    const finished=progress.build(sessions.map(session=>({...session,results:[{}]})),{now});
    assert.equal(finished.provisionalTimes,false);
    assert.doesNotMatch(progress.overviewMarkup(finished),/Some session times are provisional/);
    const unknown=progress.build([{date:'2026-11-07',results:[]},{date:'2026-11-07',results:[]}],{now});
    assert.equal(unknown.provisionalTimes,false);
});
