const test = require('node:test');
const assert = require('node:assert/strict');
const guide = require('../viewer-guide.js');

test('guide recognises competition and profile contexts without accepting unknown query identities', () => {
    assert.equal(guide.contextFor('/f3.html').sport, 'f3');
    assert.equal(guide.contextFor('/sport-view.html', '?sport=wnba&team=20').group, 'basketball');
    assert.equal(guide.contextFor('/sport-view.html', '?sport=nrlw').label, 'NRLW');
    assert.equal(guide.contextFor('/f1.html', '?sport=afl').sport, 'f1');
    assert.equal(guide.contextFor('/index.html', '?sport=__proto__').group, 'general');
});
test('contextual terms explain the selected sport and retain common status meanings', () => {
    const racing = guide.glossaryFor('f2');
    assert.ok(racing.some(entry => entry.term === 'Grid'));
    assert.ok(racing.some(entry => entry.term === '— / not available'));
    assert.equal(racing.some(entry => entry.term === 'Disposals'), false);
    assert.ok(guide.glossaryFor('aflw').some(entry => entry.term === 'Disposals'));
    assert.ok(guide.glossaryFor('wnba').some(entry => entry.term === 'PTS / REB / AST'));
    assert.ok(guide.glossaryFor('nfl').some(entry => entry.term === 'AFC / NFC'));
});
test('glossary searches meanings and synonyms and offers a recoverable empty state', () => {
    assert.equal(guide.glossaryFor('f1', 'driver ahead')[0].term, 'Interval');
    assert.equal(guide.glossaryFor('afl', 'stoppage')[0].term, 'Clearance');
    assert.ok(guide.glossaryFor('tennis', 'tie-break').length);
    assert.deepEqual(guide.glossaryFor('nba', 'qualifying'), []);
    assert.ok(guide.glossaryFor('', 'qualifying').length);
    assert.deepEqual(guide.glossaryFor('', 'unfindable-query'), []);
});
test('term markup escapes labels and meanings and definitions preserve missing-data and race-order distinctions', () => {
    const markup = guide.glossaryMarkup([{ term: '<sample>', meaning: 'A & B' }]);
    assert.match(markup, /&lt;sample&gt;/);
    assert.match(markup, /A &amp; B/);
    assert.doesNotMatch(markup, /<sample>/);
    assert.match(guide.glossaryFor('f1', 'fastest lap order').find(entry => entry.term === 'Fastest lap order').meaning, /actual race result/);
    assert.match(guide.glossaryFor('', 'dash')[0].meaning, /not a score of zero/);
    assert.equal(guide.open(), false, 'the module remains safe without a browser document');
});
test('compact guide preview brings the selected sport first and search returns every matching term', () => {
    const racing = guide.glossaryFor('f1');
    const copy = JSON.stringify(racing);
    assert.equal(guide.previewTerms(racing, 'f1').length, 6);
    assert.equal(guide.previewTerms(racing, 'f1')[0].term, 'WDC');
    assert.equal(guide.previewTerms(racing, 'f1', true).length, racing.length);
    assert.equal(guide.previewTerms(racing, 'f1', false, 'lap').length, racing.length);
    assert.ok(guide.previewTerms(guide.glossaryFor('')).every(entry => entry.group === 'common'));
    assert.equal(JSON.stringify(racing), copy);
});
