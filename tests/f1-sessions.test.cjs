const test = require("node:test");
const assert = require("node:assert/strict");
const {
    definitions,
    keysForWeekend,
    lapMilliseconds,
    intervalFor
} = require("../f1-session-utils.js");

test("a regular weekend includes three practices, qualifying and the race", () => {
    assert.deepEqual(keysForWeekend(false), ["fp1", "fp2", "fp3", "qualifying", "race"]);
    assert.deepEqual(keysForWeekend(false).map(key => definitions[key].label), ["P1", "P2", "P3", "Q", "Race"]);
});

test("a sprint weekend replaces P2 and P3 with SQ and Sprint", () => {
    assert.deepEqual(keysForWeekend(true), ["fp1", "sq", "sprint", "qualifying", "race"]);
    assert.deepEqual(keysForWeekend(true).map(key => definitions[key].label), ["P1", "SQ", "Sprint", "Q", "Race"]);
});

test("only the sprint and grand prix use race table columns", () => {
    for (const key of ["sprint", "race"]) assert.equal(definitions[key].isRace, true, key);
    for (const key of ["fp1", "fp2", "fp3", "sq", "qualifying"]) {
        assert.equal(definitions[key].isRace, false, key);
    }
});

test("lap timing conversion keeps millisecond precision", () => {
    assert.equal(lapMilliseconds("1:22.091"), 82091);
    assert.equal(lapMilliseconds("0:59.999"), 59999);
    assert.equal(lapMilliseconds("2:00.001"), 120001);
    assert.equal(lapMilliseconds("1:02:03.456"), 3723456);
    assert.equal(lapMilliseconds("0:00.000"), 0);
});

test("missing or invalid lap times cannot become a zero-second lap", () => {
    for (const value of [null, undefined, "", "–", "-", "DNF", "not available", "invalid", "1:60.000", "1:60:00.000", "-1:20.000", "1:20.12x"]) {
        assert.equal(lapMilliseconds(value), null, String(value));
    }
});

test("the leader displays Interval even before a timed lap is supplied", () => {
    assert.equal(intervalFor([{ bestLap: "1:22.091" }], 0), "Interval");
    assert.equal(intervalFor([{ bestLap: null, lapsCompleted: 0 }], 0), "Interval");
});

test("practice gaps are measured against the immediately preceding driver", () => {
    const results = [
        { bestLap: "1:22.091" },
        { bestLap: "1:22.417" },
        { bestLap: "1:22.579" }
    ];
    assert.equal(intervalFor(results, 1), "+0.326");
    assert.equal(intervalFor(results, 2), "+0.162");
});

test("intervals cross minute boundaries and preserve equal times", () => {
    assert.equal(intervalFor([{ bestLap: "0:59.999" }, { bestLap: "1:00.001" }], 1), "+0.002");
    assert.equal(intervalFor([{ bestLap: "1:22.091" }, { bestLap: "1:22.091" }], 1), "+0.000");
});

test("drivers without a timed lap do not get invented intervals", () => {
    assert.equal(intervalFor([{ bestLap: "1:22.091" }, { bestLap: null, lapsCompleted: 0 }], 1), "–");
    assert.equal(intervalFor([{ bestLap: null }, { bestLap: "1:22.091" }], 1), "–");
    assert.equal(intervalFor([{ bestLap: "1:22.091" }, { bestLap: "DNF", lapsCompleted: 12 }], 1), "–");
});

test("qualifying intervals compare drivers within the same timing segment", () => {
    assert.equal(intervalFor([
        { bestLap: "1:20.100", timingSegment: "Q3" },
        { bestLap: "1:20.350", timingSegment: "Q3" }
    ], 1), "+0.250");
    assert.equal(intervalFor([
        { bestLap: "1:20.350", timingSegment: "Q3" },
        { bestLap: "1:20.600", timingSegment: "Q2" }
    ], 1), "–");
    assert.equal(intervalFor([
        { bestLap: "1:20.350", timingSegment: "SQ2" },
        { bestLap: "1:20.600", timingSegment: "SQ1" }
    ], 1), "–");
});

test("unknown timing segments and negative differences do not produce misleading gaps", () => {
    assert.equal(intervalFor([
        { bestLap: "1:20.100", timingSegment: "Q3" },
        { bestLap: "1:20.350" }
    ], 1), "–");
    assert.equal(intervalFor([{ bestLap: "1:22.500" }, { bestLap: "1:22.100" }], 1), "–");
});


test("gap defaults follow the session type", () => {
    const { defaultGapMode } = require('../f1-session-utils.js');
    for (const key of ['fp1','fp2','fp3','qualifying','sq']) assert.equal(defaultGapMode(key), 'leader');
    for (const key of ['race','sprint']) assert.equal(defaultGapMode(key), 'interval');
});

test("practice switches between leader gap and driver-ahead interval", () => {
    const { resultGapFor } = require('../f1-session-utils.js');
    const rows = [{bestLap:'1:20.000'},{bestLap:'1:20.300'},{bestLap:'1:20.800'}];
    assert.equal(resultGapFor(rows,2,false,'leader'), '+0.800');
    assert.equal(resultGapFor(rows,2,false,'interval'), '+0.500');
    assert.equal(resultGapFor(rows,0,false,'leader'), 'Leader');
    assert.equal(resultGapFor([{bestLap:'1:20.000',timingSegment:'Q3'},{bestLap:'1:20.300',timingSegment:'Q2'}],1,false,'leader'), '–');
});

test("race intervals subtract published cumulative gaps, including sprint suffixes and minutes", () => {
    const { resultGapFor } = require('../f1-session-utils.js');
    const rows = [{time:'1:30:00.000'},{time:'+0.674s'},{time:'+2.554s'},{time:'+1:02.554'}];
    assert.equal(resultGapFor(rows,2,true,'interval'), '+1.880');
    assert.equal(resultGapFor(rows,2,true,'leader'), '+2.554s');
    assert.equal(resultGapFor(rows,3,true,'interval'), '+60.000');
    assert.equal(resultGapFor(rows,0,true,'interval'), '1:30:00.000');
});

test("retirements, lapped cars and missing race gaps do not produce false intervals", () => {
    const { resultGapFor } = require('../f1-session-utils.js');
    const rows = [{time:'1:30:00.000'},{time:'+1 lap'},{time:'+1 lap'},{time:'+8.000',retired:'DNF'},{time:'+9.000'}];
    assert.equal(resultGapFor(rows,1,true,'interval'), '+1 lap');
    assert.equal(resultGapFor(rows,2,true,'interval'), '+1 lap');
    assert.equal(resultGapFor(rows,3,true,'interval'), 'DNF');
    assert.equal(resultGapFor(rows,4,true,'interval'), '–');
});


test('fastest lap order sorts times without changing race positions or points', () => {
 const {fastestLapOrder}=require('../f1-session-utils.js');
 const race=[{position:1,points:25,fastLap:'1:21.100'},{position:2,points:18,fastLap:'1:20.900'},{position:3,points:15,fastLap:'1:20.900'}];
 const original=JSON.stringify(race), sorted=fastestLapOrder(race);
 assert.deepEqual(sorted.map(r=>r.position),[2,3,1]);
 assert.deepEqual(sorted.map(r=>r.points),[18,15,25]);
 assert.equal(sorted[0],race[1]);
 assert.equal(JSON.stringify(race),original);
});

test('missing and invalid fastest laps sort last, preserving their classified order', () => {
 const {fastestLapOrder}=require('../f1-session-utils.js');
 const race=[{position:1,fastLap:null},{position:2,fastLap:'0:00.000'},{position:3,fastLap:'DNF'},{position:4,fastLap:'1:19.999'}];
 assert.deepEqual(fastestLapOrder(race).map(r=>r.position),[4,1,2,3]);
 assert.deepEqual(fastestLapOrder(race.slice(0,3)),race.slice(0,3));
});


test('fastest lap gaps follow sorted lap times rather than race classification', () => {
 const {fastestLapOrder,fastestLapGapFor}=require('../f1-session-utils.js');
 const sorted=fastestLapOrder([{position:1,fastLap:'1:20.800'},{position:2,fastLap:'1:20.000'},{position:3,fastLap:'1:20.300'}]);
 assert.equal(fastestLapGapFor(sorted,2,'interval'),'+0.500');
 assert.equal(fastestLapGapFor(sorted,2,'leader'),'+0.800');
 assert.equal(fastestLapGapFor(sorted,0,'interval'),'Interval');
 assert.equal(fastestLapGapFor(sorted,0,'leader'),'Leader');
 assert.equal(sorted[2].position,1);
});

test('fastest lap gaps handle ties, missing laps and timed retired drivers', () => {
 const {fastestLapGapFor}=require('../f1-session-utils.js');
 const sorted=[{fastLap:'1:20.000'},{fastLap:'1:20.000',retired:'DNF'},{fastLap:null}];
 assert.equal(fastestLapGapFor(sorted,1,'interval'),'+0.000');
 assert.equal(fastestLapGapFor(sorted,2,'interval'),'–');
 assert.equal(fastestLapGapFor(sorted,2,'leader'),'–');
 assert.equal(fastestLapGapFor([{fastLap:null}],0,'leader'),'–');
});
