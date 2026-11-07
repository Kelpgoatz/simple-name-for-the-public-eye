(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SportView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const commonJS = typeof module==='object' && module.exports;
    const teamNames = commonJS ? require('./team-names.js') : TeamNames;
    const ui = () => commonJS ? require('./sports.js') : SportsUI;
    const read = (file, options) => (commonJS ? require('./snapshot-loader.js') : SportsSnapshots).read(file, options);
    const labels = {afl:'AFL',aflw:'AFLW',nrl:'NRL',nrlw:'NRLW',nba:'NBA',wnba:'WNBA',nbl:'NBL',nfl:'NFL',tennis:'Tennis'};
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const canonical = value => {
        const key = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return ({adelaide:'adelaidecrows',geelong:'geelongcats',goldcoast:'goldcoastsuns',greaterwesternsydney:'gwsgiants',sydney:'sydneyswans',westcoast:'westcoasteagles',fremantledockers:'fremantle'})[key] || key;
    };
    const url = (sport, key, id) => `sport-view.html?sport=${encodeURIComponent(sport)}&${key}=${encodeURIComponent(id)}`;
    const teamUrl = (sport, team) => url(sport, 'team', team?.id || team?.name || '');
    const matchUrl = (sport, match) => url(sport, 'match', match?.id || match?.matchId || '');
    const allMatches = data => (data.groups || []).flatMap(group => (group.matches || []).map(match => ({...match,home:match.home||{},away:match.away||{},groupId:group.id,groupLabel:group.label})));
    function scopeLabel(data) {
        if(data.sport!=='tennis')return String(data.seasonLabel||data.season||'Published season');
        const yearFormat=new Intl.DateTimeFormat('en',{timeZone:'Australia/Sydney',year:'numeric'});
        const years=[...new Set(allMatches(data).map(match=>Date.parse(match.startTime)).filter(Number.isFinite).map(time=>Number(yearFormat.format(new Date(time)))))].sort((a,b)=>a-b);
        return years.length?`${years[0]}${years.length>1?`–${years.at(-1)}`:''} published singles draw${years.length>1?'s':''}`:'Published singles draw';
    }
    const matchesTeam = (team, id) => team && id != null && id !== '' && (String(team.id) === String(id) || (canonical(id) && canonical(team.name) === canonical(id)));
    const numeric = value => (typeof value==='number' || (typeof value==='string' && value.trim())) && Number.isFinite(Number(value));
    const identityMarkup = team => typeof SportsUI!=='undefined' ? SportsUI.identity(team) : '';
    function teamSummary(matches, teamId) {
        const played = matches.filter(match => match.status === 'final' && (matchesTeam(match.home,teamId) || matchesTeam(match.away,teamId)));
        let wins = 0, losses = 0, draws = 0, scored = 0, conceded = 0, scoredGames = 0;
        const margins = [];
        played.forEach(match => {
            const side = matchesTeam(match.home,teamId) ? 'home' : 'away';
            if (match.winner === side) wins++; else if (match.winner) losses++; else if (numeric(match.homeScore) && numeric(match.awayScore) && Number(match.homeScore) === Number(match.awayScore)) draws++;
            const own = match[`${side}Score`], other = match[`${side === 'home' ? 'away' : 'home'}Score`];
            if (numeric(own) && numeric(other)) { scored += Number(own); conceded += Number(other); scoredGames++; margins.push({match, margin:Number(own)-Number(other)}); }
        });
        const best = margins.filter(item=>item.margin>0).sort((a,b)=>b.margin-a.margin)[0] || null;
        const form = [...played].sort((a,b)=>Date.parse(b.startTime)-Date.parse(a.startTime)).slice(0,5).reverse().map(match => {
            const side = matchesTeam(match.home,teamId) ? 'home' : 'away';
            return match.winner === side ? 'W' : match.winner ? 'L' : numeric(match.homeScore) && numeric(match.awayScore) && Number(match.homeScore) === Number(match.awayScore) ? 'D' : '—';
        });
        return {played:played.length,wins,losses,draws,scored,conceded,scoredGames,best,form};
    }
    const phaseLabels={all:'All games',regular:'Regular season',preseason:'Preseason',postseason:'Finals / playoffs'};
    function matchPhase(match,sport) {
        if(sport==='tennis')return 'regular';
        const label=[match.roundLabel,match.groupLabel].filter(Boolean).join(' ');
        if(/\bpre[ -]?season\b|practice match|community series/i.test(label))return 'preseason';
        if(/\bpost[ -]?season\b|\bplay[ -]?offs?\b|\bfinals?\b|wild\s*card|super bowl|divisional round|conference championship/i.test(label))return 'postseason';
        return 'regular';
    }
    const filterPhase=(matches,phase,sport)=>phase==='all'?matches:matches.filter(match=>matchPhase(match,sport)===phase);
    function availablePhases(matches,sport) {
        if(sport==='tennis')return [];
        const present=new Set(matches.map(match=>matchPhase(match,sport)));
        return present.size>1?['all','regular','preseason','postseason'].filter(phase=>phase==='all'||present.has(phase)):[];
    }
    function recentGames(matches,teamId,limit=5) {
        return matches.filter(match=>match.status==='final'&&(matchesTeam(match.home,teamId)||matchesTeam(match.away,teamId)))
            .sort((a,b)=>(Date.parse(b.startTime)||0)-(Date.parse(a.startTime)||0)||String(b.id).localeCompare(String(a.id))).slice(0,limit);
    }
    const shortDate=input=>input&&Number.isFinite(Date.parse(input))?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short'}).format(new Date(input)):'Date TBC';
    function recentMarkup(matches,team,sport) {
        const recent=recentGames(matches,team.id||team.name);
        return `<section class="viewer-recent"><div class="viewer-section-head"><h3>Recent results</h3><span>${recent.length?'Latest completed games':'No completed games in this selection'}</span></div>${recent.length?`<div class="viewer-recent__list">${recent.map(match=>{
            const home=matchesTeam(match.home,team.id||team.name),opponent=home?match.away:match.home,own=home?match.homeScore:match.awayScore,against=home?match.awayScore:match.homeScore;
            const result=match.winner===(home?'home':'away')?'W':match.winner?'L':numeric(own)&&numeric(against)&&Number(own)===Number(against)?'D':'—';
            return `<a href="${matchUrl(sport,match)}"><span class="viewer-result" data-result="${result}" aria-label="${result==='W'?'Win':result==='L'?'Loss':result==='D'?'Draw':'Result unavailable'}">${result}</span><span class="viewer-recent__opponent"><strong>${esc(teamNames.label(sport,opponent))}</strong><small>${esc(shortDate(match.startTime))} · ${home?'Home':'Away'}${match.groupLabel?` · ${esc(match.groupLabel)}`:''}</small></span><b>${numeric(own)?esc(own):'—'}<span>–</span>${numeric(against)?esc(against):'—'}</b><span aria-hidden="true">↗</span></a>`;
        }).join('')}</div>`:'<p class="viewer-note">Completed games will appear here as results are published.</p>'}</section>`;
    }
    function matchDetails(data,match,now=Date.now()){
        const start=Date.parse(match.startTime),dated=Number.isFinite(start),format=options=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',...options}).format(new Date(start));
        const group=match.groupLabel||allMatches(data).find(game=>String(game.id)===String(match.id))?.groupLabel;
        const basketball=['nba','wnba','nbl'].includes(data.sport);
        const tennisRound=data.sport==='tennis'&&/round|qualif|semi|quarter|final/i.test(match.statusDetail||'')?String(match.statusDetail).split(' · ')[0]:null;
        const round=(basketball?(group||(dated?format({weekday:'short',day:'numeric',month:'short',year:'numeric'}):null)):match.roundLabel||(tennisRound&&!/^(?:final|live)$/i.test(tennisRound)?tennisRound:null)||group)||'To be confirmed';
        const roundLabel=basketball?'Match day':data.sport==='tennis'?'Draw / round':'Round / stage';
        let note=data.sport==='tennis'?'Set scores appear as play progresses. Point-by-point statistics are not supplied by this feed.':'Scores and available player performances appear once play begins.';
        if(match.status==='final')note=data.sport==='tennis'?'Published final result. Select a player name to explore their tournament.':'Published final result. Select a team name to explore their season.';
        else if(match.status==='live')note='Score from the latest saved update. The published status and score may change.';
        else if(match.status==='postponed')note='This game has been postponed. Check the source for a confirmed replacement time.';
        else if(match.status==='cancelled')note='This game has been cancelled. No final score is assumed.';
        else if(dated&&start<=now)note='The scheduled start has passed. Awaiting a confirmed status from the latest saved feed.';
        if(match.status==='live'&&!ui().recentLive(match,now,data.fixturesUpdatedAt||data.updatedAt))note='Awaiting a fresh status update. The last reported score may be out of date.';
        const scored=numeric(match.homeScore)&&numeric(match.awayScore),difference=scored?Math.abs(Number(match.homeScore)-Number(match.awayScore)):null;
        const winner=match.winner==='home'?match.home:match.winner==='away'?match.away:null;
        let outcome=null;
        if(match.status==='final'&&data.sport!=='tennis'&&scored){
            if(difference===0)outcome={label:data.sport==='nfl'?'Tied game':'Drawn game',detail:'Level scores at full time'};
            else if(winner&&((match.winner==='home')===(Number(match.homeScore)>Number(match.awayScore))))outcome={label:`${difference} ${difference===1?'point':'points'}`,detail:`Winning margin · ${teamNames.label(data.sport,winner)}`};
        }
        return{competition:labels[data.sport]||data.sport,round,roundLabel,roundDetail:basketball?match.roundLabel||'':'',date:dated?format({weekday:'short',day:'numeric',month:'short',year:'numeric'}):'Date to be confirmed',time:dated?format({hour:'numeric',minute:'2-digit'}):'Time to be confirmed',zone:dated?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',timeZoneName:'short'}).formatToParts(new Date(start)).find(part=>part.type==='timeZoneName')?.value||'Sydney':'Sydney',venue:match.venue||'Venue to be confirmed',note,outcome};
    }
    function matchDetailsMarkup(data,match,now=Date.now()){
        const detail=matchDetails(data,match,now);
        const fact=(label,value,small='')=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}${small?`<small>${esc(small)}</small>`:''}</dd></div>`;
        return `<div class="viewer-game-details"><p class="viewer-game-details__competition">${esc(detail.competition)} · ${esc(scopeLabel(data))}${match.tour?` · ${esc(match.tour==='wta'?'Women’s singles':match.tour==='atp'?'Men’s singles':match.tour)}`:''}</p><dl class="viewer-game-facts">${fact(detail.roundLabel,detail.round,detail.roundDetail)}${fact('Start · Sydney time',detail.time,`${detail.date} · ${detail.zone}`)}${fact('Venue',detail.venue)}</dl></div>`;
    }
    function matchContextMarkup(data,match,now=Date.now()){
        const detail=matchDetails(data,match,now);
        return `<div class="viewer-game-context">${detail.outcome?`<div class="viewer-game-margin"><strong>${esc(detail.outcome.label)}</strong><span>${esc(detail.outcome.detail)}</span></div>`:''}<p class="viewer-note">${esc(detail.note)}</p></div>`;
    }
    function recentFormMarkup(matches,team,sport){
        const recent=recentGames(matches,team.id||team.name).reverse(),name=teamNames.label(sport,team);
        const badges=recent.map(match=>{
            const home=matchesTeam(match.home,team.id||team.name),side=home?'home':'away',opponent=home?match.away:match.home;
            const tied=numeric(match.homeScore)&&numeric(match.awayScore)&&Number(match.homeScore)===Number(match.awayScore);
            const result=match.winner===side?'W':match.winner?'L':tied?(sport==='nfl'?'T':'D'):'—';
            const word={W:'Win',L:'Loss',D:'Draw',T:'Tie','—':'Result unavailable'}[result],description=`${word} against ${teamNames.label(sport,opponent)} · ${shortDate(match.startTime)}`;
            return `<a href="${matchUrl(sport,match)}" data-result="${result}" aria-label="${esc(description)}" title="${esc(description)}">${result}</a>`;
        }).join('');
        return `<div class="viewer-matchup-form__team"><a class="viewer-matchup-form__name" href="${teamUrl(sport,team)}">${esc(name)}</a><div class="viewer-matchup-form__results" aria-label="${esc(name)} recent results, oldest to newest">${badges||'<span>No completed games before this one.</span>'}</div></div>`;
    }
    function matchupSummary(data,match) {
        const games=allMatches(data),homeId=match.home.id||match.home.name,awayId=match.away.id||match.away.name,phase=matchPhase(match,data.sport);
        const selectedTime=Date.parse(match.startTime);
        const before=games.filter(game=>game.status==='final'&&Number.isFinite(selectedTime)&&Number.isFinite(Date.parse(game.startTime))&&Date.parse(game.startTime)<selectedTime);
        const meetings=before.filter(game=>String(game.id)!==String(match.id)&&matchPhase(game,data.sport)===phase&&
            ((matchesTeam(game.home,homeId)&&matchesTeam(game.away,awayId))||(matchesTeam(game.home,awayId)&&matchesTeam(game.away,homeId))));
        const selected=filterPhase(before,phase,data.sport);
        return {phase,dated:Number.isFinite(selectedTime),home:teamSummary(selected,homeId),away:teamSummary(selected,awayId),homeRecent:recentGames(selected,homeId),awayRecent:recentGames(selected,awayId),meetings:[...meetings].sort((a,b)=>Date.parse(b.startTime)-Date.parse(a.startTime)),headToHead:teamSummary(meetings,homeId)};
    }
    function matchupMarkup(data,match) {
        const summary=matchupSummary(data,match),home=teamNames.label(data.sport,match.home),away=teamNames.label(data.sport,match.away);
        const showDraws=Boolean(summary.home.draws||summary.away.draws);
        const drawColumn=data.sport==='nfl'?'T':'D';
        const record=team=>`${team.wins}–${team.losses}${showDraws?`–${team.draws}`:''}`;
        const average=(team,key)=>team.scoredGames?(team[key]/team.scoredGames).toFixed(1):'—';
        const scoreLabel=data.sport==='tennis'?'Sets':'Points';
        const comparison=(label,left,right)=>`<div class="viewer-comparison__row"><strong>${esc(left)}</strong><span>${label}</span><strong>${esc(right)}</strong></div>`;
        const form=`<div class="viewer-matchup-form"><div class="viewer-matchup-form__heading"><h4>Form coming into this game</h4><p>Oldest → newest · Select a result to open that game.</p></div><div class="viewer-matchup-form__grid">${recentFormMarkup(summary.homeRecent,match.home,data.sport)}${recentFormMarkup(summary.awayRecent,match.away,data.sport)}</div><p class="viewer-matchup-form__key">W win · L loss${data.sport==='tennis'?'':data.sport==='nfl'?' · T tie':' · D draw'} · — result unavailable</p></div>`;
        if(!summary.dated)return '<section class="viewer-matchup"><div class="viewer-section-head"><h3>The matchup</h3></div><p class="viewer-note">Previous meetings and pregame records will appear once a start time is confirmed.</p></section>';
        return `<section class="viewer-matchup"><div class="viewer-section-head"><h3>The matchup</h3><span>${esc(scopeLabel(data))}${data.sport==='tennis'?'':` · ${esc(phaseLabels[summary.phase])}`}</span></div><p class="viewer-note">Completed games before this game, in the same phase of the published fixture.</p><div class="viewer-comparison"><div class="viewer-comparison__teams"><a href="${teamUrl(data.sport,match.home)}">${esc(home)}</a><span>Before this game</span><a href="${teamUrl(data.sport,match.away)}">${esc(away)}</a></div>${comparison('W–L'+(showDraws?`–${drawColumn}`:''),record(summary.home),record(summary.away))}${comparison('Completed games',summary.home.played,summary.away.played)}${comparison(`${scoreLabel} scored / game`,average(summary.home,'scored'),average(summary.away,'scored'))}${comparison(`${scoreLabel} conceded / game`,average(summary.home,'conceded'),average(summary.away,'conceded'))}</div>${form}<div class="viewer-meetings"><h4>Previous meetings</h4>${summary.meetings.length?`<p class="viewer-note">Before this game, in the same phase of the ${esc(scopeLabel(data))} fixture: <strong>${esc(home)} ${summary.headToHead.wins}–${summary.headToHead.losses}${summary.headToHead.draws?`–${summary.headToHead.draws}`:''} ${esc(away)}</strong>.</p><div class="viewer-meetings__list">${summary.meetings.slice(0,3).map(game=>`<a href="${matchUrl(data.sport,game)}"><span>${esc(shortDate(game.startTime))}</span><strong>${esc(teamNames.label(data.sport,game.home))} ${numeric(game.homeScore)?esc(game.homeScore):'—'}–${numeric(game.awayScore)?esc(game.awayScore):'—'} ${esc(teamNames.label(data.sport,game.away))}</strong><span aria-hidden="true">→</span></a>`).join('')}</div>`:'<p class="viewer-note">No earlier completed meeting is available in this phase of the published fixture.</p>'}</div></section>`;
    }
    function gameLeaders(data,match,limit=4) {
        const players=data?.matches?.[match.id]?.players||[];
        return (data?.categories||[]).flatMap(category=>{
            const ranked=players.filter(player=>numeric(player.stats?.[category.key])&&Number(player.stats[category.key])>0).sort((a,b)=>Number(b.stats[category.key])-Number(a.stats[category.key])||a.name.localeCompare(b.name));
            if(!ranked.length)return [];
            const value=Number(ranked[0].stats[category.key]);return [{...category,player:ranked[0],value,tied:ranked.filter(player=>Number(player.stats[category.key])===value).length}];
        }).slice(0,limit);
    }
    function gameLeadersMarkup(data,match) {
        const leaders=gameLeaders(data,match);
        if(!leaders.length)return '';
        return `<section class="viewer-game-leaders"><div class="viewer-section-head"><h3>Leading performances</h3><span>Recorded box score</span></div><div class="viewer-game-leaders__grid">${leaders.map(leader=>`<article><p>${esc(leader.label)}</p><strong class="viewer-game-leaders__value">${esc(leader.value)}</strong><h4>${esc(leader.player.name)}</h4><small>${esc(teamNames.label(data.sport,leader.player.teamName))}${leader.tied>1?` · Shared lead with ${leader.tied-1} other${leader.tied>2?'s':''}`:''}</small></article>`).join('')}</div></section>`;
    }
    function freshnessMarkup(data) {
        const time=data.fixturesUpdatedAt||data.updatedAt;
        if(!time||!Number.isFinite(Date.parse(time)))return '';
        const label=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',year:'numeric',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(time));
        return `<p class="viewer-note viewer-freshness">Fixtures updated <time datetime="${esc(time)}">${esc(label)} Sydney time</time>${Date.now()-Date.parse(time)>48*3600000?' · Showing a saved update; later results may be missing':''}.</p>`;
    }
    function aggregate(records, categories, options = {}) {
        const players = new Map();
        records.forEach(record => {
            const seen = new Set();
            (record.players || []).forEach(player => {
                if (options.team && !matchesTeam({id:player.teamId,name:player.teamName},options.team)) return;
                if (!player.id || seen.has(player.id)) return;
                seen.add(player.id);
                // Keep a traded player's performances with the club they represented.
                const key = `${player.id}:${player.teamId || player.teamName}`;
                if (!players.has(key)) players.set(key,{...player,stats:{},counts:{},appearances:0});
                const result = players.get(key); result.appearances++;
                categories.forEach(({key}) => { if (numeric(player.stats?.[key])) { result.stats[key]=(result.stats[key]||0)+Number(player.stats[key]);result.counts[key]=(result.counts[key]||0)+1; } });
            });
        });
        return categories.map(category => ({...category,players:[...players.values()].filter(player=>player.counts[category.key]).map(player=>({...player,value:options.mode==='average'?player.stats[category.key]/player.counts[category.key]:player.stats[category.key],sample:player.counts[category.key]})).sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name)).slice(0,6)}));
    }
    function normalizeAFL(rounds, identities = {}) {
        const team = name => { const key=canonical(name), identity=identities.afl?.[key];return {id:key,name:identity?.name || name,abbreviation:String(name).split(/\s+/).map(word=>word[0]).join('').slice(0,3),logo:identity?.image}; };
        const dated=(rounds||[]).flatMap(round=>round.matches||[]).find(match=>match.startTime && Number.isFinite(Date.parse(match.startTime.replace(/\+0000$/,'Z'))));
        return {sport:'afl',season:dated?new Date(dated.startTime.replace(/\+0000$/,'Z')).getUTCFullYear():null,seasonLabel:dated?`${new Date(dated.startTime.replace(/\+0000$/,'Z')).getUTCFullYear()} AFL Premiership`:'AFL Premiership',groups:(rounds||[]).map(round=>({id:String(round.round),label:({0:'Opening Round',25:'Wildcard Finals',26:'Qualifying & elimination finals',27:'Semi finals',28:'Preliminary finals',29:'Grand final'})[round.round]||`Round ${round.round}`,matches:(round.matches||[]).map(match=>({id:String(match.matchId),home:team(match.homeTeam),away:team(match.awayTeam),startTime:match.startTime?.replace(/\+0000$/,'Z'),status:match.status==='CONCLUDED'?'final':/LIVE|IN_PROGRESS/.test(match.status)?'live':'scheduled',homeScore:match.homeScore,awayScore:match.awayScore,venue:match.venue,winner:match.status==='CONCLUDED'&&numeric(match.homeScore)&&numeric(match.awayScore)?Number(match.homeScore)>Number(match.awayScore)?'home':Number(match.awayScore)>Number(match.homeScore)?'away':null:null}))}))};
    }
    async function load(sport) {
        if (!Object.hasOwn(labels,sport)) throw new Error('Unknown sport');
        if (sport !== 'afl') {
            const data = await read(`sports-data/${sport}.json`);
            if (data?.sport !== sport) throw new Error('Invalid sports data');
            ui().snapshotGroups(data);
            return data;
        }
        const [rounds,identities] = await Promise.all([
            read('afl-fixtures.json'),
            read('sport-identities.json',{timeout:1500}).catch(()=>null)
        ]);
        ui().snapshotGroups({groups:rounds});
        return normalizeAFL(rounds,identities||{});
    }
    async function loadStatistics(sport, season) {
        let data;
        if (sport === 'afl') {
            const cache=await read('sports-data/afl-player-matches.json');
            data={sport,season:cache.season,updatedAt:null,source:{name:'AFL',url:'https://www.afl.com.au/stats'},categories:['disposals','handballs','kicks','goals','marks','tackles','clearances','hitouts'].map(key=>({key,label:key==='disposals'?'Total disposals':key[0].toUpperCase()+key.slice(1)})),matches:Object.fromEntries(Object.entries(cache.matches||{}).map(([id,record])=>[id,{...record,players:(record.players||[]).map(player=>({...player,teamId:canonical(player.teamName),stats:Object.fromEntries(['disposals','handballs','kicks','goals','marks','tackles','clearances','hitouts'].map(key=>[key,player[key]]))}))}]))};
        } else data=await read(`sports-data/${sport}-players.json`);
        if (data?.sport!==sport || Number(data.season)!==Number(season) ||
            !Array.isArray(data.categories) || !data.categories.every(category=>typeof category?.key==='string') ||
            !data.matches || typeof data.matches!=='object' || Array.isArray(data.matches) ||
            !Object.values(data.matches).every(record=>Array.isArray(record?.players) && record.players.every(player=>typeof player?.name==='string'))) {
            throw new Error('Invalid statistics for this season');
        }
        return data;
    }
    const statisticsCache = new Map();
    function statistics(sport, season) {
        const key = `${sport}/${season}`;
        if (!statisticsCache.has(key)) {
            statisticsCache.set(key, loadStatistics(sport, season).catch(error => {
                statisticsCache.delete(key);
                throw error;
            }));
        }
        return statisticsCache.get(key);
    }
    function leadersMarkup(data, records, options={}) {
        const categories=(data?.categories||[]).filter(category=>category && typeof category.key==='string');
        if (!categories.length) return '<p class="viewer-note">Individual player statistics have not been published for this competition.</p>';
        const boards=aggregate(records,categories,options);
        return `<div class="viewer-leaders">${boards.map(board=>`<section class="viewer-leader"><h4>${esc(board.label)}</h4>${board.players.length?`<ol>${board.players.map((player,index)=>`<li><span class="viewer-rank">${index+1}</span><span><strong>${esc(player.name)}</strong><small>${esc(teamNames.label(options.sport,player.teamName))}${options.mode==='average'?` · ${player.sample} recorded games`:''}</small></span><b>${options.mode==='average'?player.value.toFixed(1):Number.isInteger(player.value)?player.value:player.value.toFixed(1)}</b></li>`).join('')}</ol>`:'<p class="viewer-note">No recorded performances yet.</p>'}</section>`).join('')}</div>`;
    }
    function coverage(data, matches, records) {
        const expected=matches.filter(match=>match.status==='final'||match.status==='live').length;
        if (!expected) return 'Player tallies will appear once this selection begins.';
        const dates=records.map(record=>Date.parse(record.updatedAt)).filter(Number.isFinite);
        const oldest=dates.length?new Date(Math.min(...dates)):null;
        return `${records.length} of ${expected} played games have individual statistics${records.length<expected?' · Partial coverage; totals and averages use recorded games only':''}.${oldest?` Oldest included update: ${new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(oldest)} Sydney time.`:''}`;
    }
    const pendingRound=new WeakMap();
    async function roundTallies(panel, sport, season, group) {
        if (!panel || sport==='tennis') return;
        const key=Symbol();
        pendingRound.set(panel,key);
        const matches=group?.matches||[];
        if (!matches.some(match=>match.status==='final'||match.status==='live')) {
            panel.innerHTML='<h3>Player leaders</h3><p class="viewer-note">Player tallies will appear once this selection begins.</p>';
            panel.removeAttribute('aria-busy');
            return;
        }
        const sports=ui(), doc=panel.ownerDocument;
        const wasFocused=panel.contains(doc.activeElement);
        sports.loadingPanel(panel,'Loading this selection’s player statistics…');
        try {
            const data=await statistics(sport,season);
            if(pendingRound.get(panel)!==key)return;
            const records=matches.map(match=>data.matches?.[match.id]).filter(Boolean);
            panel.innerHTML=`<div class="viewer-section-head"><h3>Player leaders</h3><span>Top six · Selection totals</span></div><p class="viewer-note">${esc(coverage(data,matches,records))}</p>${records.length ? leadersMarkup(data,records,{sport}) : '<p class="viewer-note">Individual statistics have not been published for these games.</p>'}`;
            panel.removeAttribute('aria-busy');
        } catch {
            if(pendingRound.get(panel)!==key)return;
            sports.retryPanel(panel,'Unable to load individual statistics right now.',()=>roundTallies(panel,sport,season,group));
        }
        if(wasFocused&&doc.activeElement===doc.body)sports.restorePanelFocus(panel);
    }
    function matchPerformance(data, match, sortKey='') {
        const record=data?.matches?.[match.id];
        if (!record?.players?.length) return `<p class="viewer-note">${match.status==='scheduled'?'Player performances will appear after play begins.':'Individual performances are not available from the latest saved feed for this game.'}</p>`;
        const categories=data.categories||[];
        const validSort=categories.some(category=>category.key===sortKey);
        const players=[...record.players].sort((a,b)=>validSort ? (numeric(b.stats?.[sortKey])?Number(b.stats[sortKey]):-Infinity)-(numeric(a.stats?.[sortKey])?Number(a.stats[sortKey]):-Infinity)||a.name.localeCompare(b.name) : String(a.teamName).localeCompare(String(b.teamName))||a.name.localeCompare(b.name));
        const source=typeof record.source==='string'?record.source:data.source?.url;
        return `<p class="viewer-note">${esc(coverage(data,[match],[record]))}${source && /^https:\/\//.test(source)?` <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">Statistics source ↗</a>`:''}</p><p class="viewer-table-hint">Scroll across to compare all statistics →</p><div class="viewer-table-wrap" tabindex="0" role="region" aria-label="Player performance table"><table class="viewer-performance"><caption>Individual performances${validSort?` · ${esc(categories.find(category=>category.key===sortKey).label)} order`:''}</caption><thead><tr><th scope="col">Player</th><th scope="col">Team</th>${categories.map(category=>`<th scope="col"${category.key===sortKey?' aria-sort="descending"':''}>${esc(category.label)}</th>`).join('')}</tr></thead><tbody>${players.map(player=>`<tr><th scope="row">${esc(player.name)}</th><td>${esc(teamNames.label(data.sport,player.teamName))}</td>${categories.map(category=>`<td${category.key===sortKey?' class="viewer-stat-selected"':''}>${numeric(player.stats?.[category.key])?esc(player.stats[category.key]):'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    function dashboard(data, team, mode='total',matches=allMatches(data),phase='all') {
        const summary=teamSummary(matches,team.id||team.name);
        const metric=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
        const isTennis=data.sport==='tennis';
        return `<div class="viewer-profile-head">${identityMarkup(team)}<div><p class="sports-kicker">${esc(labels[data.sport])} · ${esc(scopeLabel(data))}</p><h2>${esc(teamNames.label(data.sport,team))}</h2><p class="viewer-note">${isTennis?'Tournament':phase==='all'?'Season':phaseLabels[phase]} overview · ${summary.played} completed games in this selection</p></div></div><dl class="viewer-metrics">${metric('Wins',summary.wins)}${metric('Losses',summary.losses)}${!isTennis?metric('Draws / ties',summary.draws):''}${metric(mode==='average'?'Scored / game':isTennis?'Sets won':'Points scored',mode==='average'?(summary.scoredGames? (summary.scored/summary.scoredGames).toFixed(1):'—'):summary.scoredGames?summary.scored:'—')}</dl><div class="viewer-form"><span>Recent form</span>${summary.form.length?summary.form.map(result=>`<b data-result="${result}">${result}</b>`).join(''):'<span>No completed games yet</span>'}</div>${summary.best?`<p class="viewer-best"><strong>Biggest win · +${summary.best.margin}</strong> <a href="${matchUrl(data.sport,summary.best.match)}">${esc(teamNames.label(data.sport,summary.best.match.home))} ${summary.best.match.homeScore}–${summary.best.match.awayScore} ${esc(teamNames.label(data.sport,summary.best.match.away))} →</a></p>`:''}`;
    }
    function careerMarkup(data, team, archive) {
        const label=teamNames.label(data.sport,team);
        const record=archive?.teams?.[team.id] || Object.entries(archive?.teams||{}).find(([key,item])=>item&&(canonical(key)===canonical(team.id)||canonical(key)===canonical(team.name)||canonical(item.name||item.teamName||item.id)===canonical(team.id)||canonical(item.name||item.teamName||item.id)===canonical(team.name)))?.[1];
        const header=`<div class="viewer-profile-head">${identityMarkup(team)}<div><p class="sports-kicker">${esc(labels[data.sport])} · All time</p><h2>${esc(label)}</h2></div></div>`;
        if(!record) return `${header}<p class="viewer-note">Historical records for this ${data.sport==='tennis'?'player':'team'} are not available in the saved archive yet. Use the season view for current results and player performances.</p>`;
        const field=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${numeric(value)?esc(value):'—'}</dd></div>`;
        const from=record.from??archive.coverage?.from,to=record.to??archive.coverage?.to;
        const source=record.source||archive.source;
        const href=typeof source==='string'?source:source?.url;
        const achievements=Array.isArray(record.achievements)?record.achievements.filter(Boolean):[];
        const history=Array.isArray(record.history)?record.history.filter(Boolean):[];
        const best=record.bestSeason;
        return `${header}<p class="viewer-history-coverage">Historical coverage: ${esc(from||'first available season')}–${esc(to||'latest available season')} · ${esc(record.seasons??history.length)} recorded seasons</p><p class="viewer-note">${esc(record.note||archive.coverage?.note||'Totals use the seasons supplied by the historical archive; earlier or missing seasons are not included.')} Historical records are separate from the season player statistics.</p><dl class="viewer-metrics">${field('Games',record.played)}${field('Wins',record.wins)}${field('Losses',record.losses)}${field('Draws / ties',record.draws)}</dl><div class="viewer-section-head"><h3>Best achievements</h3></div><div class="viewer-achievements">${achievements.length?achievements.map(item=>`<article><p>${esc(item.year||item.season||'Career')}</p><h4>${esc(item.label)}</h4>${item.source&&/^https:\/\//.test(typeof item.source==='string'?item.source:item.source.url||'')?`<a href="${esc(typeof item.source==='string'?item.source:item.source.url)}" target="_blank" rel="noopener noreferrer">Record source ↗</a>`:''}</article>`).join(''):''}${best?`<article><p>${esc(best.label||best.year)}</p><h4>Best recorded regular season</h4><strong>${esc(best.wins)} wins${numeric(best.played)?` from ${esc(best.played)} games`:''}</strong>${numeric(best.rank)?`<p>Finished ${esc(best.rank)} in the source’s ladder group</p>`:''}</article>`:''}${!achievements.length&&!best?'<p class="viewer-note">Honours have not been supplied by this archive.</p>':''}</div>${history.length?`<details class="viewer-history"><summary>Browse ${history.length} recorded seasons</summary><div class="viewer-table-wrap" tabindex="0" role="region" aria-label="Historical season records"><table class="viewer-performance"><thead><tr><th scope="col">Season</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Losses</th><th scope="col">Draws</th><th scope="col">Rank</th></tr></thead><tbody>${[...history].sort((a,b)=>Number(b.year)-Number(a.year)).map(row=>`<tr><th scope="row">${esc(row.label||row.year)}</th>${['played','wins','losses','draws','rank'].map(key=>`<td>${numeric(row[key])?esc(row[key]):'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:''}${href&&/^https:\/\//.test(href)?`<p class="viewer-note"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(typeof source==='object'?source.name||'Historical source':'Historical source')} ↗</a></p>`:''}`;
    }
    async function loadPanel(panel, message, loadData, render, unavailable) {
        const sports=ui(), doc=panel.ownerDocument;
        const wasFocused=panel.contains(doc.activeElement);
        sports.loadingPanel(panel,message);
        try {
            render(await loadData());
            panel.removeAttribute('aria-busy');
        } catch {
            sports.retryPanel(panel,unavailable,()=>loadPanel(panel,message,loadData,render,unavailable));
        }
        if(wasFocused&&doc.activeElement===doc.body)sports.restorePanelFocus(panel);
    }
    async function initPage(doc) {
        const host=doc.querySelector('[data-viewer-page]');if(!host)return;
        const params=new URLSearchParams(location.search),sport=params.get('sport');
        if(!Object.hasOwn(labels,sport)) {host.innerHTML='<h2>Choose a sport</h2><p>Open a team or game from its fixtures page.</p><a href="index.html">Back to sport →</a>';return;}
        const sports=ui();
        const wasFocused=host.contains(doc.activeElement);
        const back=`<a class="viewer-back" href="${sport}.html">← ${labels[sport]} ${sport==='tennis'?'matches & tournament':'fixtures & ladder'}</a>`;
        sports.loadingPanel(host,'Loading your sports view…','fixtures');
        try {
            const data=await load(sport);const games=allMatches(data);
            const teamId=params.get('team'),matchId=params.get('match');
            const updatedAt=data.fixturesUpdatedAt||data.updatedAt;
            const now=Date.now();
            const unlisted=message=>{host.innerHTML=`${back}<h2>This view is unavailable</h2><p class="viewer-note">${message}</p>`;};
            if(matchId) {
                const match=games.find(match=>String(match.id)===matchId);
                if(!match) {unlisted('This game is absent from the latest published fixture.');return;}
                doc.title=`${teamNames.label(sport,match.home)} v ${teamNames.label(sport,match.away)} | cgrillo`;
                host.innerHTML=`${back}<div class="viewer-section-head"><h2>Game centre</h2></div><div class="viewer-game-centre">${matchDetailsMarkup(data,match,now)}${sports.renderMatch(match,sport,now,updatedAt)}${matchContextMarkup(data,match,now)}</div>${freshnessMarkup(data)}${matchupMarkup(data,match)}<div data-game-leaders></div><section class="viewer-section"><h3>Player performances</h3><div data-game-performance aria-live="polite"></div></section>`;
                const performance=host.querySelector('[data-game-performance]');
                if(sport==='tennis') {
                    performance.innerHTML='<p class="viewer-note">Set scores appear above. This feed does not supply point-by-point statistics.</p>';
                } else if(!['final','live'].includes(match.status)) {
                    performance.innerHTML=matchPerformance(null,match);
                } else {
                    loadPanel(performance,'Loading player performances…',()=>statistics(sport,data.season),stats=>{
                        const leaders=gameLeadersMarkup(stats,match);
                        const sorting=stats.matches?.[match.id]?.players?.length?`<label class="viewer-sort">Order by <select data-player-sort><option value="">Team & player</option>${stats.categories.map(category=>`<option value="${esc(category.key)}">${esc(category.label)}</option>`).join('')}</select></label>`:'';
                        performance.innerHTML=`${sorting}<div data-player-performances>${matchPerformance(stats,match)}</div>`;
                        performance.querySelector('[data-player-sort]')?.addEventListener('change',event=>{performance.querySelector('[data-player-performances]').innerHTML=matchPerformance(stats,match,event.target.value);});
                        host.querySelector('[data-game-leaders]').innerHTML=leaders;
                    },'Unable to load player performances right now.');
                }
                return;
            }
            const team=games.flatMap(match=>[match.home,match.away]).find(team=>matchesTeam(team,teamId));
            if(!team) {unlisted(teamId?'This team or player is absent from the latest published fixture.':'Open a team, player or game from its fixtures page.');return;}
            doc.title=`${teamNames.label(sport,team)} | ${labels[sport]} | cgrillo`;
            const teamGames=games.filter(match=>matchesTeam(match.home,teamId)||matchesTeam(match.away,teamId));
            const teamGroups=(data.groups||[]).filter(group=>(group.matches||[]).some(match=>matchesTeam(match.home,teamId)||matchesTeam(match.away,teamId))).map(group=>({...group,matches:group.matches.filter(match=>matchesTeam(match.home,teamId)||matchesTeam(match.away,teamId)).map(match=>({...match,groupLabel:group.label}))}));
            let groups=teamGroups;
            let mode='total',phase='all',scope='season',archive,archiveStatus='idle',stats,index=sports.initialGroupIndex(groups,now,'',updatedAt);
            host.innerHTML=`${back}<section class="viewer-dashboard" data-team-dashboard aria-live="polite"></section><div class="viewer-section-head"><h3>Player performances</h3><div class="sports-tabs viewer-mode" role="group" aria-label="Player statistics calculation"><button type="button" data-mode="total" aria-pressed="true">Total</button><button type="button" data-mode="average" aria-pressed="false">Average</button></div></div><div data-team-leaders aria-live="polite"></div><section class="viewer-team-fixtures fixtures-card"><div class="fixtures-card__head"><h3>${sport==='tennis'?'Tournament games':'Team fixtures'}</h3><div class="round-selector"><button type="button" data-view-prev aria-label="Previous selection">‹</button><span class="round-selector__value" data-view-round></span><button type="button" data-view-next aria-label="Next selection">›</button></div></div><input type="range" class="round-slider" data-view-slider aria-label="Choose team round or date"><div data-view-games></div></section>`;
            const recentHost=doc.createElement('div');recentHost.dataset.teamRecent='';host.querySelector('.viewer-team-fixtures').before(recentHost);
            const scopes=doc.createElement('div');scopes.className='viewer-scope';scopes.setAttribute('role','group');scopes.setAttribute('aria-label','Dashboard time range');
            scopes.innerHTML=`<button type="button" data-scope="season" aria-pressed="true">${esc(scopeLabel(data))}${sport==='tennis'?'':' season'}</button><button type="button" data-scope="career" aria-pressed="false">All time</button>`;
            host.querySelector('[data-team-dashboard]').before(scopes);
            const phases=availablePhases(teamGames,sport);
            const phaseControls=doc.createElement('div');phaseControls.className='viewer-phase';phaseControls.setAttribute('role','group');phaseControls.setAttribute('aria-label','Season phase');
            phaseControls.innerHTML=phases.map(value=>`<button type="button" data-phase="${value}" aria-pressed="${value===phase}">${phaseLabels[value]}</button>`).join('');
            scopes.after(phaseControls);
            const dashboardPanel=host.querySelector('[data-team-dashboard]');
            const leadersPanel=host.querySelector('[data-team-leaders]');
            const renderLeaders=(performance=stats)=>{
                if(!performance)return;
                const selectedGames=filterPhase(teamGames,phase,sport);
                const records=selectedGames.map(match=>performance.matches[match.id]).filter(Boolean);
                const coverageNote=coverage(performance,selectedGames,records);
                const averageNote=mode==='average'?' Averages use each player’s recorded appearances for each statistic.':'';
                leadersPanel.innerHTML=`<p class="viewer-note">${esc(coverageNote)}${records.length?averageNote:''}</p>${records.length?leadersMarkup(performance,records,{team:team.id||team.name,mode,sport}):''}`;
            };
            const renderSummary=()=>{
                scopes.querySelectorAll('[data-scope]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scope===scope)));
                phaseControls.hidden=scope==='career'||!phases.length;
                recentHost.hidden=scope==='career';
                leadersPanel.hidden=scope==='career';
                host.querySelector('.viewer-mode').parentElement.hidden=scope==='career';
                host.querySelector('.viewer-team-fixtures').hidden=scope==='career';
                if(scope==='career') {
                    if(archiveStatus==='loading') sports.loadingPanel(dashboardPanel,'Loading historical records…');
                    else if(archiveStatus==='error') sports.retryPanel(dashboardPanel,'Unable to load historical records right now.',loadArchive);
                    else {
                        dashboardPanel.innerHTML=careerMarkup(data,team,archive);
                        dashboardPanel.removeAttribute('aria-busy');
                    }
                    return;
                }
                const selectedGames=filterPhase(teamGames,phase,sport);
                phaseControls.querySelectorAll('[data-phase]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.phase===phase)));
                const scopeNote=phase==='all'?'Scope: all published fixture games, including preseason and postseason where listed. This view may differ from the regular-season ladder.':`Scope: ${phaseLabels[phase].toLowerCase()} games only. Results, player statistics and the fixture slider all use this selection.`;
                dashboardPanel.innerHTML=dashboard(data,team,mode,selectedGames,phase) + `<p class="viewer-note">${scopeNote}</p>${freshnessMarkup(data)}`;
                dashboardPanel.removeAttribute('aria-busy');
                renderLeaders();
                recentHost.innerHTML=recentMarkup(selectedGames,team,sport);
                host.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
            };
            async function loadArchive(){
                if(archiveStatus==='loading')return;
                const focused=dashboardPanel.contains(doc.activeElement);
                archiveStatus='loading';
                renderSummary();
                try {
                    const result=await read(`sports-data/${sport}-careers.json`);
                    if(!result?.teams || typeof result.teams!=='object' || Array.isArray(result.teams))throw new Error('Invalid archive');
                    archive=result;
                    archiveStatus='success';
                } catch { archiveStatus='error'; }
                if(scope==='career'){
                    renderSummary();
                    if(focused&&doc.activeElement===doc.body)sports.restorePanelFocus(dashboardPanel);
                }
            }
            const slider=host.querySelector('[data-view-slider]');slider.min='0';slider.max=String(Math.max(0,groups.length-1));slider.disabled=groups.length<2;
            const renderGames=()=>{const group=groups[index];slider.value=String(index);host.querySelector('[data-view-round]').textContent=group?.label||'No fixtures';slider.setAttribute('aria-valuetext',group?.label||'No fixtures');host.querySelector('[data-view-prev]').disabled=index===0;host.querySelector('[data-view-next]').disabled=index>=groups.length-1;FixtureSlider.update(slider,groups.map((group,value)=>({value,label:group.label,date:group.startDate,endDate:group.endDate||(group.matches||[]).map(match=>match.startTime).filter(time=>Number.isFinite(Date.parse(time))).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1)})),{unit:sport==="nfl"?"weeks":["nba","wnba","nbl","tennis"].includes(sport)?"days":"rounds"});host.querySelector('[data-view-games]').innerHTML=group?.matches.length?group.matches.map(match=>sports.renderMatch(match,sport,Date.now(),updatedAt)).join(''):'<p class="viewer-note">No fixtures have been published for this selection.</p>';};
            host.querySelector('[data-view-prev]').addEventListener('click',()=>{index=Math.max(0,index-1);renderGames();});
            host.querySelector('[data-view-next]').addEventListener('click',()=>{index=Math.min(groups.length-1,index+1);renderGames();});
            slider.addEventListener('input',()=>{index=Math.max(0,Math.min(groups.length-1,Number(slider.value)));renderGames();});
            host.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;renderSummary();}));
            phaseControls.querySelectorAll('[data-phase]').forEach(button=>button.addEventListener('click',()=>{
                const previous=groups[index]?.id;phase=button.dataset.phase;
                groups=teamGroups.map(group=>({...group,matches:filterPhase(group.matches,phase,sport)})).filter(group=>group.matches.length);
                const sameGroup=groups.findIndex(group=>group.id===previous);index=sameGroup>=0?sameGroup:sports.initialGroupIndex(groups,Date.now(),'',updatedAt);
                slider.max=String(Math.max(0,groups.length-1));slider.disabled=groups.length<2;
                renderSummary();renderGames();
            }));
            scopes.querySelectorAll('[data-scope]').forEach(button=>button.addEventListener('click',()=>{
                scope=button.dataset.scope;
                if(scope==='career'&&archiveStatus==='idle')loadArchive();
                else renderSummary();
            }));
            renderSummary();renderGames();
            if(sport==='tennis') {
                host.querySelector('.viewer-mode').hidden=true;
                leadersPanel.innerHTML='<p class="viewer-note">Published scores are available in the tournament results. This feed does not supply point-by-point statistics.</p>';
            } else {
                loadPanel(leadersPanel,'Loading player performances…',()=>statistics(sport,data.season),performance=>{
                    renderLeaders(performance);
                    stats=performance;
                },'Unable to load player performances right now.');
            }
        } catch {
            sports.retryPanel(host,'Unable to load this sports view right now.',()=>initPage(doc));
            host.insertAdjacentHTML('afterbegin',back);
        } finally {
            host.removeAttribute('aria-busy');
            if(wasFocused&&doc.activeElement===doc.body)sports.restorePanelFocus(host);
        }
    }
    return {labels,scopeLabel,canonical,teamUrl,matchUrl,teamSummary,matchPhase,filterPhase,availablePhases,recentGames,recentMarkup,matchDetails,matchDetailsMarkup,matchContextMarkup,recentFormMarkup,matchupSummary,matchupMarkup,gameLeaders,gameLeadersMarkup,aggregate,normalizeAFL,leadersMarkup,matchPerformance,careerMarkup,load,statistics,roundTallies,initPage};
});
