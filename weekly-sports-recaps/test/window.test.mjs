import test from 'node:test';
import assert from 'node:assert/strict';
import {reportingWindow,localInstant} from '../src/window.mjs';
test('weekly boundary includes the weekend and early Monday US results in Sydney',()=>{
    const window=reportingWindow({now:'2026-11-02T08:15:00Z'});
    assert.equal(window.id,'2026-11-02');assert.equal(window.end,'2026-11-02T07:00:00.000Z');assert.equal(window.start,'2026-10-26T07:00:00.000Z');
    assert.ok(Date.parse('2026-11-01T20:00:00Z')>=Date.parse(window.start));assert.ok(Date.parse('2026-11-02T04:30:00Z')<Date.parse(window.end));
});
test('a manual run before the current Monday boundary keeps the last finished week',()=>{
    assert.equal(reportingWindow({now:'2026-11-02T06:59:00Z'}).id,'2026-10-26');
    assert.equal(reportingWindow({now:'2026-11-06T00:00:00Z'}).id,'2026-11-02');
});
test('calendar weeks correctly cross both Sydney daylight-saving changes',()=>{
    const spring=reportingWindow({now:'2026-10-06T00:00:00Z',weekEnding:'2026-10-05'});
    const autumn=reportingWindow({now:'2026-04-07T00:00:00Z',weekEnding:'2026-04-06'});
    assert.equal((Date.parse(spring.end)-Date.parse(spring.start))/3600000,167);
    assert.equal((Date.parse(autumn.end)-Date.parse(autumn.start))/3600000,169);
});
test('invalid and future dates cannot create a misleading recap period',()=>{
    assert.throws(()=>localInstant('2026-02-30',18),/Invalid/);
    assert.throws(()=>reportingWindow({now:'2026-11-06T00:00:00Z',weekEnding:'2026-11-09'}),/not finished/);
});
