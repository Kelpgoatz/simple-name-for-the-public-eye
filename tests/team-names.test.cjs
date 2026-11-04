const test=require('node:test');
const assert=require('node:assert/strict');
const names=require('../team-names.js');
const ui=require('../sports.js');
test('women’s team labels have full club names and a single explicit suffix',()=>{
    assert.equal(names.label('aflw','Melbourne'),'Melbourne Demons Women’s');
    assert.equal(names.label('nrlw','Sharks'),'Cronulla-Sutherland Sharks Women’s');
    assert.equal(names.label('nrlw','Newcastle Knights Women'),'Newcastle Knights Women’s');
    assert.equal(names.label('wnba','Las Vegas Aces Women’s'),'Las Vegas Aces Women’s');
    assert.equal(names.label('afl','Melbourne'),'Melbourne');
    assert.equal(names.label('aflw','Winner of EF1'),'Winner of EF1');
});
test('women’s displays do not modify provider team identities used for profile links',()=>{
    const team={id:'5',name:'Melbourne'};
    const html=ui.renderMatch({id:'m',home:team,away:{id:'6',name:'Carlton'},status:'scheduled'},'aflw');
    assert.match(html,/Melbourne Demons Women’s/);
    assert.match(html,/sport=aflw&team=5/);
    assert.equal(team.name,'Melbourne');
});
