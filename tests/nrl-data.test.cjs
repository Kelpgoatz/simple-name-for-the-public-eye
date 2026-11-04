const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../scripts/lib/nrl-data.mjs');

test('NRL scheduled scores are absent and a nil-nil final is a draw', async () => {
    const { normalizeNrlMatch } = await api;
    const raw = { homeTeam: { teamId: 1, nickName: 'A', score: 0 }, awayTeam: { teamId: 2, nickName: 'B', score: 0 }, matchMode: 'Pre', matchState: 'PreGame' };
    assert.equal(normalizeNrlMatch(raw, new Map(), 1).homeScore, null);
    const final = normalizeNrlMatch({ ...raw, matchMode: 'Post', matchState: 'FullTime' }, new Map(), 1);
    assert.equal(final.homeScore, 0);
    assert.equal(final.winner, null);
});

test('NRL uses official ladder points including byes, not wins times two', async () => {
    const { normalizeNrlLadder } = await api;
    const rows = normalizeNrlLadder({ positions: [{ teamNickname: 'A', theme: { key: 'a' }, stats: { wins: 18, byes: 3, points: 42, played: 24, lost: 6, drawn: 0 } }] }, new Map([['1', { id: '1', name: 'A', key: 'a' }]]));
    assert.equal(rows[0].points, 42);
    assert.equal(rows[0].byes, 3);
});

test('NRL refuses a previous season returned for a new-year request', async () => {
    const { fetchNrl } = await api;
    await assert.rejects(fetchNrl({ now: new Date('2027-01-01'), fetchJson: async () => ({ selectedSeasonId: 2026, selectedCompetitionId: 111, filterRounds: [{ value: 1 }] }) }), /2027.*not published/);
});

test('NRL rejects incomplete round responses instead of replacing full cached fixtures', async () => {
    const { fetchNrl } = await api;
    const draw = { selectedSeasonId: 2026, selectedCompetitionId: 111, selectedRoundId: 1, filterRounds: [{ value: 1, name: 'Round 1' }, { value: 2, name: 'Round 2' }], filterTeams: [], fixtures: [{ type: 'Match', homeTeam: { teamId: 1 }, awayTeam: { teamId: 2 } }] };
    await assert.rejects(fetchNrl({ now: new Date('2026-04-01'), fetchJson: async url => url.includes('&round=2') ? { ...draw, selectedRoundId: 2, fixtures: [] } : draw }), /Empty NRL round 2/);
});

test('NRLW requests its own official competition and keeps ladder/fixture identities aligned', async () => {
    const { fetchNrl } = await api;
    const draw = { selectedSeasonId: 2026, selectedCompetitionId: 161, selectedRoundId: 1, filterRounds: [{ value: 1, name: 'Round 1' }], filterTeams: [{ value: 1, name: 'A Women', theme: { key: 'a' } }, { value: 2, name: 'B Women', theme: { key: 'b' } }], fixtures: [{ type: 'Match', matchState: 'FullTime', homeTeam: { teamId: 1, score: 6 }, awayTeam: { teamId: 2, score: 0 }, clock: { kickOffTimeLong: '2026-08-01T04:00:00Z' } }] };
    const ladder = { selectedSeasonId: 2026, selectedCompetitionId: 161, positions: [{ theme: { key: 'a' }, stats: { played: 1, wins: 1, lost: 0, drawn: 0, points: 2 } }] };
    const calls = [];
    const data = await fetchNrl({ sport: 'nrlw', now: new Date('2026-11-04T00:00Z'), fetchJson: async url => { calls.push(url); return url.includes('/ladder/') ? ladder : draw; } });
    assert.equal(data.sport, 'nrlw');
    assert.ok(calls.every(url => url.includes('competition=161')));
    assert.equal(data.groups[0].matches[0].home, data.standings[0].rows[0].team);
    assert.match(data.standings[0].label, /NRLW/);
});
