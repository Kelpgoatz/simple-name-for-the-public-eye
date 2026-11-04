const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const identity = require('../sport-identities.js');
const data = JSON.parse(fs.readFileSync(new URL('../sport-identities.json', `file://${__filename.replaceAll('\\', '/')}`), 'utf8'));

test('AFL abbreviated fixture names resolve to the same identity as ladder club names', () => {
    for (const [fixture, ladder] of [['Adelaide', 'Adelaide Crows'], ['Sydney', 'Sydney Swans'], ['Greater Western Sydney', 'GWS GIANTS'], ['Geelong', 'Geelong Cats'], ['Gold Coast', 'Gold Coast SUNS'], ['West Coast', 'West Coast Eagles']]) {
        assert(identity.find(data, 'afl', fixture), fixture);
        assert.equal(identity.find(data, 'afl', fixture), identity.find(data, 'afl', ladder));
    }
    assert.equal(identity.find(data, 'afl', 'TBD'), undefined);
});
test('every currently ranked F1 driver and constructor has a matched image', () => {
    for (const standing of require('../drivers-championship.json').drivers_championship) assert(identity.find(data, 'drivers', standing.driverId), standing.driverId);
    for (const standing of require('../constructors-championship.json').constructors_championship) assert(identity.find(data, 'constructors', standing.teamId), standing.teamId);
});
test('practice-only reserves and alternate driver IDs also resolve to flags', () => {
    const walk = value => {
        if (!value || typeof value !== 'object') return;
        if (value.driverId) assert(identity.find(data, 'drivers', value.driverId), value.driverId);
        Object.values(value).forEach(walk);
    };
    walk(require('../f1-fixtures.json'));
    walk(require('../f1-sessions.json'));
});
test('flags use driver nationality and unknown nationalities remain unavailable', async () => {
    const { flagCode } = await import('../scripts/lib/identity-utils.mjs');
    for (const [name, code] of [['Great Britain', 'gb'], ['British', 'gb'], ['Italy', 'it'], ['Netherlands', 'nl'], ['New Zealand', 'nz'], ['Monaco', 'mc'], ['Brazil', 'br']]) assert.equal(flagCode(name), code);
    assert.equal(flagCode('unknown'), null);
    assert.equal(flagCode(''), null);
});
