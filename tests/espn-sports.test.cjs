const test = require("node:test");
const assert = require("node:assert/strict");
const modulePromise = import("../scripts/lib/espn-sports.mjs");
const team = (id, name = `Team ${id}`) => ({ id, displayName: name, abbreviation: `T${id}`, color: "123456", logo: `https://example.test/${id}.png` });
const event = (id, date = "2026-11-04T01:00Z", year = 2027, extra = {}) => ({
    id, date, season: { year, type: 2 },
    competitions: [{ date, timeValid: true, competitors: [
        { homeAway: "away", team: team("2"), score: "99", winner: false },
        { homeAway: "home", team: team("1"), score: "101", winner: true }
    ], status: { type: { state: "post", completed: true, shortDetail: "Final" } } }], ...extra
});
const standings = (year = 2027) => ({ season: { year }, children: [
    { id: "e", name: "Eastern Conference", standings: { season: year, entries: [
        { team: team("2"), stats: [{ name: "playoffSeed", value: 2 }, { name: "wins", value: 5 }, { name: "losses", value: 2 }, { name: "winPercent", value: 5 / 7 }] },
        { team: team("1"), stats: [{ name: "playoffSeed", value: 1 }, { name: "wins", value: 6 }, { name: "losses", value: 1 }, { name: "winPercent", value: 6 / 7 }] }
    ] } }
] });
const discovery = (year = 2027) => ({ leagues: [{ slug: "nba", season: {
    year, displayName: "2026-27", startDate: "2026-10-01T00:00Z", endDate: "2027-01-31T00:00Z"
} }], events: [] });

test("normalizes identities, colors, final scores and actual home/away labels", async () => {
    const { normalizeEspnEvent } = await modulePromise;
    const match = normalizeEspnEvent(event("a"), 2027);
    assert.equal(match.home.id, "1");
    assert.equal(match.away.id, "2");
    assert.equal(match.home.color, "#123456");
    assert.equal(match.homeScore, 101);
    assert.equal(match.awayScore, 99);
    assert.equal(match.winner, "home");
    assert.equal(normalizeEspnEvent(event("old", undefined, 2026), 2027), null);
});

test("scheduled zero scores remain unavailable and postponed games are not finals", async () => {
    const { normalizeEspnEvent } = await modulePromise;
    const raw = event("a");
    raw.competitions[0].status.type = { state: "pre", name: "STATUS_SCHEDULED" };
    const match = normalizeEspnEvent(raw, 2027);
    assert.equal(match.status, "scheduled");
    assert.equal(match.homeScore, null);
    assert.equal(match.winner, null);
    assert.equal(match.statusDetail, "Scheduled");
    raw.competitions[0].timeValid = false;
    assert.equal(normalizeEspnEvent(raw, 2027).statusDetail, "Time TBC");
    assert.equal(normalizeEspnEvent(raw, 2027).startTime, null);
    raw.competitions[0].status.type = { state: "post", name: "STATUS_POSTPONED" };
    assert.equal(normalizeEspnEvent(raw, 2027).status, "postponed");
});

test("standings use provider ranks rather than alphabetical response order", async () => {
    const { normalizeEspnStandings } = await modulePromise;
    const result = normalizeEspnStandings(standings(), 2027);
    assert.equal(result[0].label, "Eastern Conference");
    assert.deepEqual(result[0].rows.map(row => row.rank), [1, 2]);
    assert.equal(result[0].rows[0].played, 7);
    assert.equal(result[0].rows[0].points, null);
    assert.equal(result[0].rows[0].for, null);
    assert.throws(() => normalizeEspnStandings(standings(2026), 2027), /season mismatch/);
    const contradictory = standings(); contradictory.season.year = 2026;
    assert.throws(() => normalizeEspnStandings(contradictory, 2027), /season mismatch/);
});

test("NBL top-level standings and NFL conference tables use the same safe normalizer", async () => {
    const { normalizeEspnStandings } = await modulePromise;
    const data = { id: "55", name: "NBL", season: { year: 2027 }, standings: standings().children[0].standings, children: [] };
    assert.equal(normalizeEspnStandings(data, 2027)[0].label, "NBL");
    const nfl = standings(2026);
    nfl.children[0].standings.entries[0].stats.push({ name: "ties", value: 1 });
    assert.equal(normalizeEspnStandings(nfl, 2026)[0].rows[1].played, 8);
});

test("groups Sydney dates and deduplicates repeated scoreboard events", async () => {
    const { groupEspnEvents } = await modulePromise;
    const raw = event("a", "2026-11-04T20:00Z");
    const groups = groupEspnEvents("nba", [raw, raw, event("old", undefined, 2026)], 2027);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].id, "2026-11-05");
    assert.equal(groups[0].matches.length, 1);
});

test("NFL groups preserve published postseason names", async () => {
    const { groupEspnEvents } = await modulePromise;
    const raw = event("a", "2027-02-08T00:00Z", 2026);
    raw.season.type = 3;
    raw.week = { number: 4 };
    const groups = groupEspnEvents("nfl", [raw], 2026, [{ value: "3", label: "Postseason", entries: [{ value: "4", label: "Super Bowl", startDate: "2027-02-03T00:00Z" }] }]);
    assert.equal(groups[0].label, "Super Bowl");
    assert.equal(groups[0].id, "3-4");
});

test("cross-year schedules fetch every published season month", async () => {
    const { fetchEspnSport } = await modulePromise;
    const calls = [];
    const fetchJson = async url => {
        calls.push(url);
        if (url.includes("/standings")) return standings();
        if (!url.includes("?")) return discovery();
        return { events: url.includes("202611") ? [event("a")] : [] };
    };
    const result = await fetchEspnSport("nba", { fetchJson, now: new Date("2026-11-04T00:00Z") });
    assert.equal(result.season, 2027);
    assert.equal(result.seasonLabel, "2026-27");
    assert.deepEqual(calls.filter(url => url.includes("dates=")).map(url => new URL(url).searchParams.get("dates")).sort(), ["202610", "202611", "202612", "202701"]);
    assert.equal(result.groups.flatMap(group => group.matches).length, 1);
});

test("capped monthly responses are split by day rather than silently truncated", async () => {
    const { fetchEspnSport } = await modulePromise;
    const info = discovery();
    info.leagues[0].season.startDate = "2026-11-01T00:00Z";
    info.leagues[0].season.endDate = "2026-11-30T00:00Z";
    const calls = [];
    const fetchJson = async url => {
        if (url.includes("/standings")) return standings();
        if (!url.includes("?")) return info;
        const date = new URL(url).searchParams.get("dates"); calls.push(date);
        return { events: date === "202611" ? Array.from({ length: 1000 }, (_, i) => event(String(i))) : date === "20261104" ? [event("real")] : [] };
    };
    const result = await fetchEspnSport("nba", { fetchJson });
    assert.equal(calls.filter(date => date.length === 8).length, 30);
    assert.deepEqual(result.groups.flatMap(group => group.matches).map(match => match.id), ["real"]);
});

test("partial schedule failures retain same-season cached fixtures", async () => {
    const { fetchEspnSport, groupEspnEvents } = await modulePromise;
    const previous = { sport: "nba", season: 2027, seasonLabel: "2026-27", updatedAt: "2026-11-01T00:00:00.000Z", groups: groupEspnEvents("nba", [event("cached")], 2027), standings: [] };
    const fetchJson = async url => {
        if (url.includes("/standings")) return standings();
        if (!url.includes("?")) return discovery();
        if (url.includes("202611")) throw new Error("temporary failure");
        return { events: [] };
    };
    const result = await fetchEspnSport("nba", { fetchJson, previous });
    assert.equal(result.groups[0].matches[0].id, "cached");
    assert.match(result.notice, /retained/);
    assert.equal(result.fixturesUpdatedAt, previous.updatedAt);
    await assert.rejects(fetchEspnSport("nba", { fetchJson, previous: { ...previous, season: 2026 } }), /Incomplete ESPN schedule/);
});

test("standings from the previous season are never published as current", async () => {
    const { fetchEspnSport } = await modulePromise;
    const fetchJson = async url => url.includes("/standings") ? standings(2026) : url.includes("?") ? { events: [event("a")] } : discovery();
    const result = await fetchEspnSport("nba", { fetchJson, previous: { sport: "nba", season: 2026, standings: [{ id: "old" }] } });
    assert.deepEqual(result.standings, []);
    assert.match(result.notice, /not been published/);
    assert.equal(result.standingsUpdatedAt, null);
});

test("unavailable standings retain their last successful timestamp", async () => {
    const { fetchEspnSport } = await modulePromise;
    const previous = { sport: "nba", season: 2027, updatedAt: "2026-11-03T00:00:00.000Z", standingsUpdatedAt: "2026-11-01T00:00:00.000Z", standings: [{ id: "cached" }] };
    const fetchJson = async url => { if (url.includes("/standings")) throw Error("unavailable"); return url.includes("?") ? { events: [event("a")] } : discovery(); };
    const result = await fetchEspnSport("nba", { fetchJson, previous, now: new Date("2026-11-04T00:00Z") });
    assert.deepEqual(result.standings, previous.standings);
    assert.equal(result.standingsUpdatedAt, previous.standingsUpdatedAt);
    assert.equal(result.fixturesUpdatedAt, "2026-11-04T00:00:00.000Z");
    assert.equal(result.source.url, "https://www.espn.com/nba/scoreboard");
});

test("WNBA takes the scoreboard season and explicitly requests that ladder year", async () => {
    const { fetchEspnSport } = await modulePromise;
    const info = discovery(2026);
    info.leagues[0].slug = 'wnba';
    info.leagues[0].season.displayName = '2026';
    info.leagues[0].season.startDate = '2026-04-01T00:00Z';
    info.leagues[0].season.endDate = '2026-11-05T00:00Z';
    const calls = [];
    const fetchJson = async url => {
        calls.push(url);
        if (url.includes('/standings')) return standings(2026);
        if (!url.includes('?')) return info;
        return { events: [event('wnba-game', '2026-10-31T00:00Z', 2026)] };
    };
    const data = await fetchEspnSport('wnba', { fetchJson, now: new Date('2026-11-04T00:00Z') });
    assert.equal(data.sport, 'wnba');
    assert.equal(data.season, 2026);
    assert.ok(calls.some(url => url.includes('/basketball/wnba/standings?season=2026')));
    assert.equal(data.standings[0].rows.length, 2);
    const home = data.groups[0].matches[0].home;
    assert.equal(home, data.standings[0].rows.find(row => row.team.id === home.id).team);
});
