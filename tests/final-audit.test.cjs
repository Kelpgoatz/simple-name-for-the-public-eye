const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));

test('saved historical totals reconcile to unique recorded seasons and honours retain source attribution', () => {
    for (const sport of ['afl', 'aflw', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'tennis']) {
        const data = read(`sports-data/${sport}-careers.json`);
        assert.ok(Object.keys(data.teams).length, `${sport}: historical profiles exist`);
        for (const [id, record] of Object.entries(data.teams)) {
            const history = record.history;
            assert.ok(history.length, `${sport}/${id}: source seasons exist`);
            assert.equal(new Set(history.map(row => String(row.seasonId))).size, history.length, `${sport}/${id}: seasons are counted once`);
            for (const key of ['played', 'wins', 'losses', 'draws']) {
                assert.equal(record[key], history.reduce((total, row) => total + row[key], 0), `${sport}/${id}: ${key} reconciles`);
            }
            assert.equal(record.played, record.wins + record.losses + record.draws, `${sport}/${id}: all results reconcile`);
            for (const award of record.achievements) {
                assert.match(award.source, /^https:\/\//, `${sport}/${id}: honour source`);
                assert.ok(Number.isInteger(award.year), `${sport}/${id}: honour year`);
            }
        }
    }
});

test('every saved current F2 driver flag has an official nationality source', () => {
    const data = read('f2-data.json');
    assert.ok(data.drivers.length > 0);
    for (const driver of data.drivers) {
        assert.match(driver.flagUrl, /^https:\/\/flagcdn\.com\/w160\/[a-z]{2}\.png$/, `${driver.name}: flag image`);
        assert.match(driver.nationalitySource, /^https:\/\/www\.fiaformula2\.com\/en\/drivers\//, `${driver.name}: official nationality source`);
        assert.ok(driver.nationality, `${driver.name}: nationality label`);
    }
});

test('F2 stays out of default homepage games and ladders but becomes available for explicit favourites', () => {
    const ladders = require('../home-ladders.js');
    const following = require('../home-following.js');
    const f2 = read('f2-data.json');
    const now = Date.parse(`${f2.season}-11-04T12:00:00Z`);
    const summaries = following.f2Summaries(f2, now);
    const empty = {leagues: [], teams: [], drivers: []};
    assert.equal(ladders.cardsFor({f2}, now).length, 0);
    assert.ok(summaries.length);
    assert.ok(summaries.every(game => !following.follows(game, empty)));
    const league = {leagues: ['f2'], teams: [], drivers: []};
    assert.ok(summaries.every(game => following.follows(game, league)));
    const cards = ladders.cardsFor({f2}, now, ['f2']);
    assert.equal(cards.length, 2);
    const team = f2.teams[0];
    const selected = ladders.preferredLadders(cards, {leagues: [], teams: [{sport: 'f2', id: team.id, name: team.name}], drivers: []}, now);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].views[0].id, 'f2-teams');
    const href = new URL(selected[0].views[0].href, 'https://example.com');
    assert.equal(href.pathname, '/f2.html');
    assert.equal(href.searchParams.get('standing'), 'teams');
});
