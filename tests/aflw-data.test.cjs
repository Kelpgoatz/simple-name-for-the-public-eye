const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../scripts/lib/aflw-data.mjs');

const team = (id, name) => ({ id, name, abbreviation: `T${id}`, club: { name } });
const entry = (id, name) => ({ position: id, team: team(id, name), played: 12, pointsFor: 700, pointsAgainst: 350, thisSeasonRecord: { aggregatePoints: 44, percentage: 200, winLossRecord: { played: 12, wins: 11, losses: 1, draws: 0 } } });
const seasons = [
    { id: 96, name: '2026 NAB AFLW Season', shortName: '2026 AFL Womens', competition: { code: 'AFLW' }, season: { year: 2026 } },
    { id: 97, name: '2026 AFLW Practice Matches', competition: { code: 'AFLW' }, season: { year: 2026 } },
    { id: 98, name: '2026 NAB AFLW Australia v Ireland', competition: { code: 'AFLW' }, season: { year: 2026 } },
    { id: 102, name: '2027 Toyota AFL Premiership', competition: { code: 'AFL' }, season: { year: 2027 } }
];
const match = (id, round = 1) => ({ id, compSeason: { id: 96 }, round: { id: round, roundNumber: round }, status: 'CONCLUDED', utcStartTime: '2026-08-09T06:35:00.000+0000', home: { team: team(1, 'Home Club'), score: { totalScore: 40 } }, away: { team: team(2, 'Away Club'), score: { totalScore: 40 } } });

test('AFLW selects domestic current-year season and excludes practice/international series', async () => {
    const { selectAflwSeason } = await api;
    assert.equal(selectAflwSeason(seasons, 2026).id, 96);
    assert.equal(selectAflwSeason(seasons, 2027), null);
});

test('AFLW fixture and ladder identities share the same reviewed club logo', async () => {
    const { normalizeAflwTeam, normalizeAflwMatch, normalizeAflwLadder } = await api;
    const identities = { homeclub: { name: 'Home Club', image: 'https://example.test/home.png' }, awayclub: { image: 'https://example.test/away.png' } };
    const teams = new Map([['1', normalizeAflwTeam(team(1, 'Home Club'), identities)], ['2', normalizeAflwTeam(team(2, 'Away Club'), identities)]]);
    const fixture = normalizeAflwMatch(match(10), teams);
    const ladder = normalizeAflwLadder({ compSeason: { id: 96 }, ladders: [{ entries: [entry(1, 'Home Club')] }] }, teams, 96);
    assert.equal(fixture.home, ladder[0].team);
    assert.equal(fixture.home.logo, 'https://example.test/home.png');
    assert.equal(ladder[0].points, 44);
    assert.equal(ladder[0].percentage, 200);
    assert.equal(fixture.winner, null);
    assert.equal(fixture.homeScore, 40);
});

test('AFLW placeholder finals do not turn week-marker dates into kickoff times', async () => {
    const { normalizeAflwMatch } = await api;
    const raw = { ...match(11, 16), status: 'PLACEHOLDER' };
    const fixture = normalizeAflwMatch(raw, new Map());
    assert.equal(fixture.startTime, null);
    assert.equal(fixture.statusDetail, 'Date and time TBC');
    assert.equal(fixture.homeScore, null);
    assert.equal(fixture.winner, null);
});

test('AFLW mismatched ladder seasons are rejected', async () => {
    const { normalizeAflwLadder } = await api;
    assert.throws(() => normalizeAflwLadder({ compSeason: { id: 84 }, ladders: [{ entries: [entry(1, 'Home Club')] }] }, new Map(), 96), /season mismatch/);
});

test('AFLW follows all match and round pagination including finals', async () => {
    const { fetchAflw } = await api;
    const calls = [];
    const fetchJson = async url => {
        calls.push(url);
        const q = new URL(url).searchParams;
        if (url.includes('/compseasons?')) return { compSeasons: seasons, meta: { pagination: { numPages: 1, numEntries: seasons.length } } };
        if (url.includes('/matches?')) return { matches: [match(q.get('page') === '0' ? 10 : 11, q.get('page') === '0' ? 1 : 16)], meta: { pagination: { numPages: 2, numEntries: 2 } } };
        if (url.includes('/rounds?')) return { rounds: [{ id: 1, roundNumber: 1, name: 'Round 1', utcStartTime: '2026-08-09T06:35:00Z', utcEndTime: '2026-08-16T06:45:00Z' }, { id: 16, roundNumber: 16, name: 'Grand Final', utcStartTime: '2026-11-23T01:00:00Z', utcEndTime: '2026-11-23T01:00:00Z' }], meta: { pagination: { numPages: 1, numEntries: 2 } } };
        if (url.includes('/ladders')) return { compSeason: { id: 96 }, ladders: [{ entries: [entry(1, 'Home Club'), entry(2, 'Away Club')] }] };
        if (url.includes('espn.com')) return { sports: [] };
        throw Error('Unexpected URL: ' + url);
    };
    const data = await fetchAflw({ fetchJson, now: new Date('2026-11-04T00:00Z') });
    assert.equal(data.sport, 'aflw');
    assert.equal(data.season, 2026);
    assert.equal(data.groups.length, 2);
    assert.equal(data.groups[1].label, 'Grand Final');
    assert.equal(data.seasonStart, '2026-08-09T06:35:00.000Z');
    assert.equal(data.seasonEnd, '2026-11-23T01:00:00.000Z');
    assert.equal(data.groups[1].endDate, '2026-11-23T01:00:00.000Z');
    assert.equal(data.groups.flatMap(g => g.matches).length, 2);
    assert.equal(calls.filter(url => url.includes('/matches?')).length, 2);
});

test('AFLW refuses old-year fixtures during preseason rollover', async () => {
    const { fetchAflw } = await api;
    await assert.rejects(fetchAflw({ fetchJson: async () => ({ compSeasons: seasons, meta: { pagination: { numPages: 1, numEntries: seasons.length } } }), now: new Date('2027-01-01T00:00Z') }), /2027 AFLW.*not published/);
});

test('AFLW season remains active when an announced final is later than its original week marker', async () => {
    const { aflwSeasonBounds } = await api;
    const groups = [{ startDate: '2026-08-09T06:35:00.000Z', endDate: '2026-08-16T06:45:00.000Z', matches: [] }, { startDate: '2026-11-23T01:00:00.000Z', endDate: '2026-11-23T01:00:00.000Z', matches: [{ startTime: null }] }];
    assert.equal(aflwSeasonBounds(groups).seasonEnd, '2026-11-23T01:00:00.000Z');
    groups[1].matches[0].startTime = '2026-11-28T08:00:00.000Z';
    assert.equal(aflwSeasonBounds(groups).seasonEnd, '2026-11-28T11:00:00.000Z');
});
