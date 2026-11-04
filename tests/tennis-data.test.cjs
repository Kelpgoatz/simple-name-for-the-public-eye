const test = require("node:test");
const assert = require("node:assert/strict");
const helpers = import("../scripts/lib/tennis-data.mjs");

const event = (id, name, start, end, groupings = []) => ({ id, name, date: start, endDate: end, season: { year: Number(start.slice(0, 4)) }, groupings, calendar: { timeZone: "America/New_York" } });
const player = (id, name, homeAway, winner, scores) => ({ id, homeAway, winner, athlete: { displayName: name, shortName: name, flag: { href: "https://example.test/flag.png" } }, linescores: scores.map(([value, won]) => ({ value, winner: won })) });
const match = {
    id: "final-1", date: "2026-09-13T18:00:00Z", timeValid: true,
    status: { type: { state: "post", completed: true, detail: "Final" } }, round: { displayName: "Final" },
    competitors: [player("away", "Away Player", "away", false, [[4, false], [7, true], [3, false]]), player("home", "Home Player", "home", true, [[6, true], [6, false], [6, true]])]
};
const currentSlam = groupings => event("us-2026", "US Open", "2026-08-24T04:00:00Z", "2026-09-14T03:59:00Z", groupings);
const feed = events => ({ events });

test("Grand Slam identification rejects other majors and recognises alternate names", async () => {
    const { grandSlamKey } = await helpers;
    assert.equal(grandSlamKey("Australian Open"), "australian-open");
    assert.equal(grandSlamKey("French Open"), "roland-garros");
    assert.equal(grandSlamKey("Roland Garros"), "roland-garros");
    assert.equal(grandSlamKey("U.S. Open"), "us-open");
    assert.equal(grandSlamKey("ATP Finals"), null);
});

test("active tournament takes precedence and invalid date ranges are excluded", async () => {
    const { selectNearestSlam } = await helpers;
    const active = event("a", "Wimbledon", "2026-07-01", "2026-07-14");
    const invalid = event("b", "US Open", "2026-07-10", "2026-07-01");
    assert.equal(selectNearestSlam([invalid, active], new Date("2026-07-10")).id, "a");
});

test("nearest selection compares both past end and upcoming start dates", async () => {
    const { selectNearestSlam } = await helpers;
    const past = event("past", "US Open", "2026-08-24", "2026-09-14");
    const future = event("future", "Australian Open", "2027-01-10", "2027-01-31");
    assert.equal(selectNearestSlam([future, past], new Date("2026-11-04")).id, "past");
    assert.equal(selectNearestSlam([past, future], new Date("2026-12-20")).id, "future");
});

test("match sets and winner keep source home/away identity despite reversed source ordering", async () => {
    const { normalizeTennisMatch } = await helpers;
    const normalized = normalizeTennisMatch(match, "atp");
    assert.equal(normalized.home.name, "Home Player");
    assert.equal(normalized.away.name, "Away Player");
    assert.equal(normalized.winner, "home");
    assert.equal(normalized.homeScore, 2);
    assert.equal(normalized.awayScore, 1);
    assert.deepEqual(normalized.sets, [{ home: 6, away: 4 }, { home: 6, away: 7 }, { home: 6, away: 3 }]);
});

test("no played sets remain unknown instead of becoming zero scores", async () => {
    const { normalizeTennisMatch } = await helpers;
    const normalized = normalizeTennisMatch({ ...match, status: { type: { state: "pre" } }, competitors: [player("a", "A", "home", false, []), player("b", "B", "away", false, [])] }, "wta");
    assert.equal(normalized.homeScore, null);
    assert.equal(normalized.awayScore, null);
    assert.equal(normalized.winner, null);
    assert.equal(normalized.status, "scheduled");
});

test("date groups use the tournament timezone and retain both tours", async () => {
    const { groupTennisMatches } = await helpers;
    const groups = groupTennisMatches([{ id: "1", startTime: "2026-09-01T01:00:00Z", tour: "atp" }, { id: "2", startTime: "2026-08-31T23:00:00Z", tour: "wta" }], "America/New_York");
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, "2026-08-31");
    assert.equal(groups[0].matches.length, 2);
});

test("current and next-year feeds choose a real Slam and only singles from each tour", async () => {
    const { fetchTennis } = await helpers;
    const slam = currentSlam([
        { grouping: { slug: "mens-singles" }, competitions: [match] },
        { grouping: { slug: "womens-singles" }, competitions: [{ ...match, id: "women-final" }] },
        { grouping: { slug: "mixed-doubles" }, competitions: [{ ...match, id: "mixed" }] }
    ]);
    const calls = [];
    const result = await fetchTennis({ now: new Date("2026-11-04"), fetchJson: async url => { calls.push(url); return feed(url.includes("dates=2027") ? [] : [slam]); } });
    assert.equal(calls.length, 4);
    assert.equal(result.seasonLabel, "US Open 2026");
    assert.equal(result.groups.flatMap(group => group.matches).length, 2);
    assert.deepEqual(result.standings, []);
    assert.match(result.notice, /2027 Grand Slam dates have not yet been published/);
});

test("nearer unpublished next season draw is primary while old results are retained separately", async () => {
    const { fetchTennis } = await helpers;
    const past = currentSlam([]);
    const upcoming = event("ao-2027", "Australian Open", "2027-01-10", "2027-01-31");
    const previous = { seasonLabel: "US Open 2026", tournament: { name: "US Open", startDate: "2026-08-24T04:00:00.000Z" }, groups: [{ matches: [{ id: "old-result" }] }] };
    const result = await fetchTennis({ now: new Date("2026-12-20"), previous, fetchJson: async url => feed(url.includes("dates=2027") ? [upcoming] : [past]) });
    assert.equal(result.seasonLabel, "Australian Open 2027");
    assert.deepEqual(result.groups[0].matches, []);
    assert.equal(result.groups[0].startDate, "2027-01-10T00:00:00.000Z");
    assert.equal(result.previousTournament.groups[0].matches[0].id, "old-result");
});

test("source failures throw for the orchestrator to retain last valid data", async () => {
    const { fetchTennis } = await helpers;
    await assert.rejects(fetchTennis({ now: new Date("2026-11-04"), fetchJson: async () => { throw Error("Temporary network failure"); } }), /No dated Grand Slam/);
});
