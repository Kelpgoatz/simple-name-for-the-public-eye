const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../sports.js');

test('standings key explains the scoring ratio and winning percentage distinctly', () => {
    const afl = ui.standingDefinitions('afl').find(column => column.key === 'percentage');
    const aflw = ui.standingDefinitions('aflw').find(column => column.key === 'percentage');
    const nba = ui.standingDefinitions('nba').find(column => column.key === 'winPct');
    assert.equal(afl.title, 'Scoring percentage');
    assert.match(afl.meaning, /Points scored ÷ points conceded/);
    assert.deepEqual(aflw, afl);
    assert.equal(nba.title, 'Winning percentage');
    assert.match(nba.meaning, /Games won ÷ games played/);
    assert.match(ui.standingDefinitions('nfl').find(column => column.key === 'winPct').meaning, /half of ties/);
});
test('each competition key includes exactly its displayed statistic columns', () => {
    for (const sport of ['afl','aflw','nba','wnba','nbl','nrl','nrlw','nfl','f1-drivers','f1-constructors']) {
        assert.deepEqual(ui.standingDefinitions(sport).map(({ key, label }) => [key, label]), ui.standingColumns(sport));
    }
    assert.equal(ui.standingDefinitions('nba').find(column => column.key === 'gamesBehind').title, 'Games behind');
    assert.equal(ui.standingDefinitions('nrlw').find(column => column.key === 'difference').title, 'Points difference');
    assert.equal(ui.standingDefinitions('f1-constructors').find(column => column.key === 'points').title, 'Championship points');
    assert.match(ui.standingDefinitions('f1-drivers').find(column => column.key === 'wins').meaning, /this driver/);
});
test('table key is available through native keyboard and touch disclosure and retains row order and values', () => {
    const rows = [{rank:2,team:{name:'First source row'},wins:4,losses:2,winPct:.667,gamesBehind:1},{rank:1,team:{name:'Second source row'},wins:5,losses:1,winPct:.833,gamesBehind:0}];
    const before = JSON.stringify(rows), html = ui.renderStandings({label:'Eastern Conference',rows},'nba');
    assert.match(html, /<details class="sports-table-key"><summary>/);
    assert.doesNotMatch(html, /<details[^>]+\bopen\b/);
    assert.match(html, /What the columns mean/);
    assert.match(html, /abbr="Games behind">GB<\/th>/);
    assert.match(html, /data-guide-sport="nba"/);
    assert.match(html, /66\.7%/);
    assert.ok(html.indexOf('First source row') < html.indexOf('Second source row'));
    assert.equal(JSON.stringify(rows),before);
    assert.doesNotMatch(ui.renderStandings({rows:[]},'nba'), /sports-table-key/);
});
