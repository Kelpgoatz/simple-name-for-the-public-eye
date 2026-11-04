const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('all thirteen pages expose permanent sports links and the three league families', () => {
    for (const page of ['index', 'article', 'melbourne', 'afl', 'aflw', 'f1', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'tennis']) {
        const html = fs.readFileSync(path.join(__dirname, '..', `${page}.html`), 'utf8');
        const nav = html.match(/<nav class="nav nav--permanent"[\s\S]*?<\/nav>/)?.[0];
        assert(nav, page);
        assert.doesNotMatch(nav, /data-sport-(?:toggle|menu|subnav)/, page);
        for (const family of ['afl', 'nrl', 'nba']) {
            assert.equal((nav.match(new RegExp(`data-league-group="${family}"`, 'g')) || []).length, 1, page);
            assert(nav.includes(`id="${family}-menu"`), page);
            assert(nav.includes(`id="${family}-subnav"`), page);
        }
        for (const slug of ['afl', 'aflw', 'f1', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'tennis']) assert(nav.includes(`href="${slug}.html"`), `${page}: ${slug}`);
        for (const slug of ['index', 'f1', 'nbl', 'nfl', 'tennis']) assert(nav.includes(`href="${slug}.html"`), page);
        if (!['article', 'melbourne'].includes(page)) assert(nav.includes(`href="${page}.html" aria-current="page"`), page);
    }
});
