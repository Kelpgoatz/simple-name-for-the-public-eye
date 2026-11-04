const test = require("node:test");
const assert = require("node:assert/strict");
const ui = require("../sports.js");

const now = Date.parse("2026-11-04T00:00:00Z");
const futureMatch = { status: "scheduled", startTime: "2026-11-05T00:00:00Z" };

test("slider opens on a live group before a future group", () => {
    assert.equal(ui.initialGroupIndex([
        { matches: [futureMatch] },
        { matches: [{ status: "live", startTime: "2026-11-03T23:00:00Z" }] }
    ], now), 1);
});

test("stale provider live flags do not open months-old games or claim they are live", () => {
    const oldLive = { status: "live", startTime: "2026-08-25T08:30:00Z", statusDetail: "3:24 - 2nd", homeScore: 27, awayScore: 32 };
    assert.equal(ui.initialGroupIndex([{ matches: [oldLive] }, { matches: [futureMatch] }], now), 1);
    const html = ui.renderMatch(oldLive, "nbl", now);
    assert.match(html, /Update pending/);
    assert.doesNotMatch(html, /data-status="live"/);
    assert.match(html, /class="sports-score">27/);
});

test("slider chooses future fixtures, then the last published completed group", () => {
    const groups = [
        { matches: [{ status: "final", startTime: "2026-10-20T00:00:00Z" }] },
        { matches: [futureMatch] },
        { matches: [{ status: "scheduled", startTime: "2026-11-08T00:00:00Z" }] }
    ];
    assert.equal(ui.initialGroupIndex(groups, now), 1);
    assert.equal(ui.initialGroupIndex(groups.map(group => ({ matches: group.matches.map(match => ({ ...match, status: "final" })) })), now), 2);
    assert.equal(ui.initialGroupIndex([], now), 0);
});

test("undated released fixtures remain discoverable", () => {
    assert.equal(ui.initialGroupIndex([{ matches: [{ status: "scheduled", startTime: null }] }, { matches: [] }], now), 0);
});

test("a finished nil score remains zero, and ties do not invent a winner", () => {
    const html = ui.renderMatch({ home: { name: "Home" }, away: { name: "Away" }, homeScore: 0, awayScore: 0, status: "final", winner: null }, "nfl");
    assert.equal((html.match(/class="sports-score">0/g) || []).length, 2);
    assert.doesNotMatch(html, /sports-competitor--winner/);
});

test("scheduled API zero scores are hidden until play begins", () => {
    const html = ui.renderMatch({ homeScore: 0, awayScore: 0, status: "scheduled" }, "nba");
    assert.equal((html.match(/class="sports-score">—/g) || []).length, 2);
    assert.doesNotMatch(html, /class="sports-score">0/);
});

test("winner styling follows provider winner flags", () => {
    const html = ui.renderMatch({ home: { name: "Winner" }, away: { name: "Runner-up" }, status: "final", winner: "home", homeScore: 7, awayScore: 3 }, "nrl");
    assert.equal((html.match(/sports-competitor--winner/g) || []).length, 1);
    assert.match(html, /Winner<span class="sports-visually-hidden">, winner/);
});

test("tennis tours filter independently and retain set-by-set scores", () => {
    const group = { matches: [{ id: 1, tour: "atp", status: "final", sets: [{ home: 6, away: 0 }, { home: 7, away: 5 }] }, { id: 2, tour: "wta" }] };
    assert.deepEqual(ui.filteredMatches(group, "atp").map(match => match.id), [1]);
    assert.deepEqual(ui.filteredMatches(group, "wta").map(match => match.id), [2]);
    const html = ui.renderMatch(group.matches[0], "tennis");
    assert.match(html, /sports-set">6/);
    assert.match(html, /sports-set">0/);
    assert.match(html, /sports-set">7/);
    assert.match(html, /sports-set">5/);
});

test("current group respects the selected tennis tour", () => {
    assert.equal(ui.initialGroupIndex([{ matches: [{ ...futureMatch, tour: "atp" }] }, { matches: [{ ...futureMatch, tour: "wta" }] }], now, "wta"), 1);
});

test("completed tennis tours open on their own latest match day", () => {
    const groups = [{ matches: [{ tour: "wta", status: "final" }] }, { matches: [{ tour: "atp", status: "final" }] }];
    assert.equal(ui.initialGroupIndex(groups, now, "wta"), 0);
    assert.equal(ui.initialGroupIndex(groups, now, "atp"), 1);
});

test("untrusted provider labels and links cannot inject markup or unsafe protocols", () => {
    const html = ui.renderMatch({ status: "scheduled", home: { name: '<img src=x onerror="alert(1)">', color: 'red;display:none', logo: 'javascript:alert(1)' }, url: 'javascript:alert(1)' }, "nbl");
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /javascript:|onerror="|style="--team-color:red/);
    assert.equal(ui.safeUrl("https://www.espn.com/nba/"), "https://www.espn.com/nba/");
    assert.equal(ui.safeUrl("data:text/html,hello"), "");
});

test("conference ladders preserve source order and missing values", () => {
    const east = { label: "Eastern Conference", rows: [{ rank: 1, team: { name: "East team" }, wins: 0, losses: 0, winPct: null, gamesBehind: null }] };
    const west = { label: "Western Conference", rows: [{ rank: 1, team: { name: "West team" }, wins: 5, losses: 2, winPct: .714, gamesBehind: 0 }] };
    assert.match(ui.renderStandings(east, "nba"), /Eastern Conference/);
    assert.doesNotMatch(ui.renderStandings(east, "nba"), /West team|NaN|0.0%/);
    assert.match(ui.renderStandings(west, "nba"), /71.4%/);
    assert.match(ui.renderStandings({ rows: [] }, "nba"), /not been published/);
});

test("NRL points difference is only calculated from two supplied totals", () => {
    const html = ui.renderStandings({ rows: [{ rank: 1, team: { name: "Team" }, for: 40, against: 33, points: 2 }, { rank: 2, team: { name: "Other" }, for: null, against: 10, points: null }] }, "nrl");
    assert.match(html, /<td>7<\/td>/);
    assert.doesNotMatch(html, /<td>-10<\/td>/);
});

test("tennis calendar shows confirmed dates and honest unavailable information", () => {
    assert.match(ui.renderTournament({}, now), /calendar is available/);
    const html = ui.renderTournament({ name: "Australian Open", startDate: "2027-01-18", endDate: "2027-01-31", venue: "Melbourne", surface: "Hard" }, now);
    assert.match(html, /Upcoming/);
    assert.match(html, /Melbourne/);
    assert.match(html, /2027/);
});

test("cached prior seasons and stale data are identified without mislabeling cross-year seasons", () => {
    const current = { season: 2026, seasonLabel: "2026 season", updatedAt: "2026-11-04T00:00:00Z" };
    assert.deepEqual(ui.dataNotices(current, "nrl", now), []);
    assert.match(ui.dataNotices({ ...current, season: 2025, seasonLabel: "2025 season" }, "nrl", now)[0], /2025 season/);
    assert.deepEqual(ui.dataNotices({ ...current, season: 2027, seasonLabel: "2026–27 season" }, "nba", now), []);
    assert.deepEqual(ui.dataNotices({ ...current, updatedAt: "2027-01-04T00:00:00Z" }, "nfl", Date.parse("2027-01-04T01:00:00Z")), []);
    assert.match(ui.dataNotices({ ...current, updatedAt: "2026-10-30T00:00:00Z" }, "nbl", now).join(" "), /saved update/);
});

test("women’s ladders use the correct sport-specific statistics", () => {
    assert.deepEqual(ui.standingColumns("aflw").map(([key]) => key), ["played", "wins", "losses", "draws", "percentage", "points"]);
    assert.deepEqual(ui.standingColumns("nrlw"), ui.standingColumns("nrl"));
    assert.deepEqual(ui.standingColumns("wnba"), ui.standingColumns("nba"));
    const aflw = ui.renderStandings({ rows: [{ rank: 1, team: { name: "Team" }, percentage: 0.5, points: 4 }] }, "aflw");
    assert.match(aflw, /0.5%/);
    assert.doesNotMatch(aflw, /50.0%/);
    const wnba = ui.renderStandings({ label: "WNBA", rows: [{ rank: 1, team: { name: "WNBA Team" }, wins: 12, losses: 4, winPct: .75, gamesBehind: 0 }] }, "wnba");
    assert.match(wnba, /75.0%/);
    assert.match(wnba, /WNBA Team/);
});

test("women’s calendar-year seasons do not inherit NBA ending-year assumptions", () => {
    const current = { season: 2026, updatedAt: "2026-11-04T00:00:00Z" };
    for (const sport of ["aflw", "nrlw", "wnba"]) {
        assert.deepEqual(ui.dataNotices(current, sport, now), []);
        assert.match(ui.dataNotices({ ...current, season: 2027, seasonLabel: "2027 season" }, sport, now).join(" "), /upcoming season/);
        assert.match(ui.dataNotices({ ...current, season: 2025, seasonLabel: "2025 season" }, sport, now).join(" "), /2025 season.*new season/);
    }
    assert.deepEqual(ui.dataNotices({ ...current, season: 2027, seasonLabel: "2026–27" }, "nba", now), []);
});


test('AFL and AFLW share the same ladder columns and percentage formatting', () => {
 assert.deepEqual(ui.standingColumns('afl'),ui.standingColumns('aflw'));
 const table=ui.renderStandings({label:'AFL Ladder',rows:[{rank:1,team:{name:'Club'},played:12,wins:10,losses:2,draws:0,percentage:130.4,points:40}]},'afl');
 assert.match(table,/130.4%/);
 assert(table.includes('>Pts</th>'));
 assert.match(table,/sports-table__primary">40/);
});

test('F1 championship tables label drivers and teams correctly and retain points and wins', () => {
 const rows=[{rank:2,team:{name:'Driver A',abbreviation:'DA'},points:261,wins:3}];
 const wdc=ui.renderStandings({label:'World Drivers Championship',rows},'f1-drivers');
 const wcc=ui.renderStandings({label:'World Constructors Championship',rows},'f1-constructors');
 assert(wdc.includes('>Driver</th>'));
 assert(wcc.includes('>Team</th>'));
 assert(wdc.includes('>Wins</th>'));
 assert.match(wdc,/sports-table__primary">261/);
 assert(!wdc.includes('>P</th>') && !wdc.includes('>L</th>'));
});
