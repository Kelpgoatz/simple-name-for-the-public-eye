const test=require('node:test');
const assert=require('node:assert/strict');
const view=require('../sport-view.js');
const home={id:'A',name:'Alpha'},away={id:'B',name:'Beta'};
const target={id:'target',home,away,startTime:'2026-11-06T10:00:00Z',status:'scheduled',homeScore:0,awayScore:0,groupLabel:'Round 12',venue:'The Park'};
const data={sport:'nba',season:2027,seasonLabel:'2026–27',groups:[{id:'12',label:'Round 12',matches:[target]}]};

test('game facts provide local date, Sydney timezone, published round and venue',()=>{
    const facts=view.matchDetails(data,target,Date.parse('2026-11-06T00:00:00Z'));
    assert.equal(facts.competition,'NBA');
    assert.equal(facts.round,'Round 12');
    assert.equal(facts.venue,'The Park');
    assert.match(facts.date,/6 Nov 2026/);
    assert.match(facts.time,/9:00/);
    assert.match(facts.zone,/AEDT|GMT\+11/);
    const markup=view.matchDetailsMarkup(data,target);
    assert.match(markup,/Start · Sydney time/);
    assert.match(markup,/Match day/);
    assert.match(markup,/The Park/);
});
test('basketball facts use the published match day while retaining the season phase',()=>{
    for(const sport of ['nba','wnba','nbl']){
        const facts=view.matchDetails({...data,sport},{...target,groupLabel:'Fri, 6 Nov 2026',roundLabel:'Regular season'});
        assert.equal(facts.roundLabel,'Match day');
        assert.equal(facts.round,'Fri, 6 Nov 2026');
        assert.equal(facts.roundDetail,'Regular season');
    }
    assert.equal(view.matchDetails({...data,sport:'nrl'},target).roundLabel,'Round / stage');
});
test('future and overdue scheduled matches do not turn placeholder zero scores into a result',()=>{
    const future=view.matchDetails(data,target,Date.parse('2026-11-05T00:00:00Z'));
    assert.equal(future.outcome,null);
    assert.match(future.note,/once play begins/);
    const overdue=view.matchDetails(data,target,Date.parse('2026-11-07T00:00:00Z'));
    assert.equal(overdue.outcome,null);
    assert.match(overdue.note,/Awaiting a confirmed status/);
    assert.doesNotMatch(view.matchContextMarkup(data,target,Date.parse('2026-11-07T00:00:00Z')),/Winning margin|Drawn game/);
});
test('published final margins require scores and a consistent winner, with ties distinguished',()=>{
    const finished={...target,status:'final',homeScore:101,awayScore:99,winner:'home'};
    assert.deepEqual(view.matchDetails(data,finished).outcome,{label:'2 points',detail:'Winning margin · Alpha'});
    assert.equal(view.matchDetails(data,{...finished,awayScore:null}).outcome,null);
    assert.equal(view.matchDetails(data,{...finished,winner:'away'}).outcome,null);
    assert.equal(view.matchDetails({...data,sport:'tennis'},finished).outcome,null,'tennis retirements must not become invented winning set margins');
    assert.equal(view.matchDetails({...data,sport:'nfl'},{...finished,awayScore:101,winner:null}).outcome.label,'Tied game');
});
test('unknown dates, venues and stale live feeds have truthful visual details',()=>{
    const unknown={...target,startTime:null,venue:null,groupLabel:null};
    const facts=view.matchDetails({...data,groups:[]},unknown);
    assert.equal(facts.date,'Date to be confirmed');
    assert.equal(facts.time,'Time to be confirmed');
    assert.equal(facts.venue,'Venue to be confirmed');
    assert.equal(facts.round,'To be confirmed');
    assert.match(view.matchDetails(data,{...target,status:'postponed'}).note,/postponed/);
    assert.match(view.matchDetails(data,{...target,status:'cancelled'}).note,/cancelled/);
    assert.match(view.matchDetails(data,{...target,status:'live'},Date.parse('2026-11-09T00:00:00Z')).note,/fresh status update/);
});
test('game facts escape provider text and preserve tennis draw context',()=>{
    const match={...target,roundLabel:'<Round>',venue:'<img src=x>',statusDetail:'Qualifying 1st Round · Final',tour:'wta'};
    const html=view.matchDetailsMarkup({...data,sport:'tennis'},match);
    assert.match(html,/Women’s singles/);
    assert.match(html,/&lt;Round&gt;/);
    assert.match(html,/&lt;img src=x&gt;/);
    assert.doesNotMatch(html,/<img/);
    assert.equal(view.matchDetails({...data,sport:'tennis'},{...match,roundLabel:null}).round,'Qualifying 1st Round');
    assert.match(view.matchDetails({...data,sport:'tennis'},target).note,/Point-by-point statistics are not supplied/);
});
test('pregame form contains only earlier completed games in the same phase, with linked accessible outcomes',()=>{
    const game=(id,day,extra={})=>({...target,id,startTime:`2026-11-0${day}T10:00:00Z`,status:'final',homeScore:10,awayScore:5,winner:'home',...extra});
    const selected={...target,status:'final',homeScore:100,awayScore:90,winner:'home'};
    const snapshot={...data,groups:[{id:'12',label:'Round 12',matches:[game('old',1,{roundLabel:'Preseason'}),game('win',2),game('loss',3,{winner:'away',homeScore:4,awayScore:8}),game('live',4,{status:'live'}),selected,game('later',9)]}]};
    const summary=view.matchupSummary(snapshot,selected);
    assert.deepEqual(summary.homeRecent.map(match=>match.id),['loss','win']);
    const markup=view.matchupMarkup(snapshot,selected);
    assert.match(markup,/Form coming into this game/);
    assert.match(markup,/aria-label="Win against Beta/);
    assert.match(markup,/aria-label="Loss against Beta/);
    assert.match(markup,/Oldest → newest/);
    assert.match(markup,/sport=nba&match=win/);
    assert.doesNotMatch(markup,/match=later|match=old|match=live/);
    assert.match(view.recentFormMarkup([game('tie',2,{homeScore:5,awayScore:5,winner:null})],home,'nfl'),/data-result="T"/);
});
