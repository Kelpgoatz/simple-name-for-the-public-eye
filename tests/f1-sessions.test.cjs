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
