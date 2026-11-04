(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SportView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const teamNames = typeof module==='object' && module.exports ? require('./team-names.js') : TeamNames;
    const labels = {afl:'AFL',aflw:'AFLW',nrl:'NRL',nrlw:'NRLW',nba:'NBA',wnba:'WNBA',nbl:'NBL',nfl:'NFL',tennis:'Tennis'};
    const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const canonical = value => {
        const key = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return ({adelaide:'adelaidecrows',geelong:'geelongcats',goldcoast:'goldcoastsuns',greaterwesternsydney:'gwsgiants',sydney:'sydneyswans',westcoast:'westcoasteagles',fremantledockers:'fremantle'})[key] || key;
    };
    const url = (sport, key, id) => `sport-view.html?sport=${encodeURIComponent(sport)}&${key}=${encodeURIComponent(id)}`;
    const teamUrl = (sport, team) => url(sport, 'team', team?.id || team?.name || '');
    const matchUrl = (sport, match) => url(sport, 'match', match?.id || match?.matchId || '');
    const allMatches = data => (data.groups || []).flatMap(group => (group.matches || []).map(match => ({...match,groupId:group.id,groupLabel:group.label})));
    const matchesTeam = (team, id) => String(team?.id) === String(id) || canonical(team?.name) === canonical(id);
    const numeric = value => value !== '' && value != null && Number.isFinite(Number(value));
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
    const fetching = new Map();
    function json(file) {
        if (!fetching.has(file)) fetching.set(file,fetch(file,{cache:'no-cache'}).then(response=>{if(!response.ok)throw new Error('Unavailable');return response.json();}));
        return fetching.get(file);
    }
    async function load(sport) {
        if (!Object.hasOwn(labels,sport)) throw new Error('Unknown sport');
        if (sport !== 'afl') return json(`sports-data/${sport}.json`);
        const [rounds,identities] = await Promise.all([json('afl-fixtures.json'),json('sport-identities.json').catch(()=>({}))]);
        return normalizeAFL(rounds,identities);
    }
    async function statistics(sport, season) {
        let data;
        if (sport === 'afl') {
            const cache=await json('sports-data/afl-player-matches.json');
            data={sport,season:cache.season,updatedAt:null,source:{name:'AFL',url:'https://www.afl.com.au/stats'},categories:['disposals','handballs','kicks','goals','marks','tackles','clearances','hitouts'].map(key=>({key,label:key==='disposals'?'Total disposals':key[0].toUpperCase()+key.slice(1)})),matches:Object.fromEntries(Object.entries(cache.matches||{}).map(([id,record])=>[id,{...record,players:(record.players||[]).map(player=>({...player,teamId:canonical(player.teamName),stats:Object.fromEntries(['disposals','handballs','kicks','goals','marks','tackles','clearances','hitouts'].map(key=>[key,player[key]]))}))}]))};
        } else data=await json(`sports-data/${sport}-players.json`);
        if (Number(data.season)!==Number(season)) throw new Error('Player data belongs to another season');
        return data;
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
        const key=Symbol();pendingRound.set(panel,key);
        panel.innerHTML='<h3>Player leaders</h3><p class="viewer-note">Loading this selection’s player statistics…</p>';
        try {
            const data=await statistics(sport,season);
            if(pendingRound.get(panel)!==key)return;
            const matches=group?.matches||[],records=matches.map(match=>data.matches?.[match.id]).filter(Boolean);
            panel.innerHTML=`<div class="viewer-section-head"><h3>Player leaders</h3><span>Top six · Selection totals</span></div><p class="viewer-note">${esc(coverage(data,matches,records))}</p>${leadersMarkup(data,records,{sport})}`;
        } catch {
            if(pendingRound.get(panel)===key) panel.innerHTML='<h3>Player leaders</h3><p class="viewer-note">Individual statistics are unavailable for this selection. Fixtures and results remain available.</p>';
        }
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
    function dashboard(data, team, mode='total') {
        const summary=teamSummary(allMatches(data),team.id||team.name);
        const metric=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
        const isTennis=data.sport==='tennis';
        return `<div class="viewer-profile-head">${identityMarkup(team)}<div><p class="sports-kicker">${esc(labels[data.sport])} · ${esc(data.seasonLabel||data.season)}</p><h2>${esc(teamNames.label(data.sport,team))}</h2><p class="viewer-note">${isTennis?'Tournament':'Season'} overview · ${summary.played} completed games in the published fixture</p></div></div><dl class="viewer-metrics">${metric('Wins',summary.wins)}${metric('Losses',summary.losses)}${!isTennis?metric('Draws / ties',summary.draws):''}${metric(mode==='average'?'Scored / game':isTennis?'Sets won':'Points scored',mode==='average'?(summary.scoredGames? (summary.scored/summary.scoredGames).toFixed(1):'—'):summary.scoredGames?summary.scored:'—')}</dl><div class="viewer-form"><span>Recent form</span>${summary.form.length?summary.form.map(result=>`<b data-result="${result}">${result}</b>`).join(''):'<span>No completed games yet</span>'}</div>${summary.best?`<p class="viewer-best"><strong>Biggest win · +${summary.best.margin}</strong> <a href="${matchUrl(data.sport,summary.best.match)}">${esc(teamNames.label(data.sport,summary.best.match.home))} ${summary.best.match.homeScore}–${summary.best.match.awayScore} ${esc(teamNames.label(data.sport,summary.best.match.away))} →</a></p>`:''}`;
    }
    function careerMarkup(data, team, archive) {
        const label=teamNames.label(data.sport,team);
        const record=archive?.teams?.[team.id] || Object.entries(archive?.teams||{}).find(([key,item])=>canonical(key)===canonical(team.id)||canonical(key)===canonical(team.name)||canonical(item.name||item.teamName||item.id)===canonical(team.id)||canonical(item.name||item.teamName||item.id)===canonical(team.name))?.[1];
        const header=`<div class="viewer-profile-head">${identityMarkup(team)}<div><p class="sports-kicker">${esc(labels[data.sport])} · All time</p><h2>${esc(label)}</h2></div></div>`;
        if(!record) return `${header}<p class="viewer-note">Historical records for this ${data.sport==='tennis'?'player':'team'} are not available in the saved archive yet. Use the season view for current results and player performances.</p>`;
        const field=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${numeric(value)?esc(value):'—'}</dd></div>`;
        const from=record.from??archive.coverage?.from,to=record.to??archive.coverage?.to;
        const source=record.source||archive.source;
        const href=typeof source==='string'?source:source?.url;
        const achievements=record.achievements||[];
        const history=Array.isArray(record.history)?record.history:[];
        const best=record.bestSeason;
        return `${header}<p class="viewer-history-coverage">Historical coverage: ${esc(from||'first available season')}–${esc(to||'latest available season')} · ${esc(record.seasons??history.length)} recorded seasons</p><p class="viewer-note">${esc(record.note||archive.coverage?.note||'Totals use the seasons supplied by the historical archive; earlier or missing seasons are not included.')} Historical records are separate from the season player statistics.</p><dl class="viewer-metrics">${field('Games',record.played)}${field('Wins',record.wins)}${field('Losses',record.losses)}${field('Draws / ties',record.draws)}</dl><div class="viewer-section-head"><h3>Best achievements</h3></div><div class="viewer-achievements">${achievements.length?achievements.map(item=>`<article><p>${esc(item.year||item.season||'Career')}</p><h4>${esc(item.label)}</h4>${item.source&&/^https:\/\//.test(typeof item.source==='string'?item.source:item.source.url||'')?`<a href="${esc(typeof item.source==='string'?item.source:item.source.url)}" target="_blank" rel="noopener noreferrer">Record source ↗</a>`:''}</article>`).join(''):''}${best?`<article><p>${esc(best.label||best.year)}</p><h4>Best recorded regular season</h4><strong>${esc(best.wins)} wins${numeric(best.played)?` from ${esc(best.played)} games`:''}</strong>${numeric(best.rank)?`<p>Finished ${esc(best.rank)} in the source’s ladder group</p>`:''}</article>`:''}${!achievements.length&&!best?'<p class="viewer-note">Honours have not been supplied by this archive.</p>':''}</div>${history.length?`<details class="viewer-history"><summary>Browse ${history.length} recorded seasons</summary><div class="viewer-table-wrap" tabindex="0" role="region" aria-label="Historical season records"><table class="viewer-performance"><thead><tr><th scope="col">Season</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Losses</th><th scope="col">Draws</th><th scope="col">Rank</th></tr></thead><tbody>${[...history].sort((a,b)=>Number(b.year)-Number(a.year)).map(row=>`<tr><th scope="row">${esc(row.label||row.year)}</th>${['played','wins','losses','draws','rank'].map(key=>`<td>${numeric(row[key])?esc(row[key]):'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:''}${href&&/^https:\/\//.test(href)?`<p class="viewer-note"><a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(typeof source==='object'?source.name||'Historical source':'Historical source')} ↗</a></p>`:''}`;
    }
    async function initPage(doc) {
        const host=doc.querySelector('[data-viewer-page]');if(!host)return;
        const params=new URLSearchParams(location.search),sport=params.get('sport');
        if(!Object.hasOwn(labels,sport)) {host.innerHTML='<h2>Choose a sport</h2><p>Open a team or game from its fixtures page.</p><a href="index.html">Back to sport →</a>';return;}
        host.innerHTML='<p class="sports-empty">Loading your sports view…</p>';
        try {
            const data=await load(sport);const games=allMatches(data);
            const teamId=params.get('team'),matchId=params.get('match');
            const back=`<a class="viewer-back" href="${sport}.html">← ${labels[sport]} fixtures & ladder</a>`;
            let stats=await statistics(sport,data.season).catch(()=>null);
            if(matchId) {
                const match=games.find(match=>String(match.id)===matchId);
                if(!match)throw new Error('Game not in the latest published fixture.');
                doc.title=`${match.home.name} v ${match.away.name} | cgrillo`;
                host.innerHTML=`${back}<div class="viewer-section-head"><h2>Game centre</h2><span>${esc(match.groupLabel)}</span></div><div class="viewer-game-centre">${SportsUI.renderMatch(match,sport)}</div><section class="viewer-section"><h3>Player performances</h3>${stats?.matches?.[match.id]?.players?.length?`<label class="viewer-sort">Order by <select data-player-sort><option value="">Team & player</option>${(stats.categories||[]).map(category=>`<option value="${esc(category.key)}">${esc(category.label)}</option>`).join('')}</select></label>`:''}<div data-player-performances>${matchPerformance(stats,match)}</div></section><p class="viewer-note">${sport==='tennis'?'Set scores appear above; point-by-point player statistics are not supplied by this feed.':''}</p>`;
                host.querySelector('[data-player-sort]')?.addEventListener('change',event=>{host.querySelector('[data-player-performances]').innerHTML=matchPerformance(stats,match,event.target.value);});
                return;
            }
            const team=games.flatMap(match=>[match.home,match.away]).find(team=>matchesTeam(team,teamId));
            if(!team)throw new Error('Team or player not in the latest published fixture.');
            doc.title=`${teamNames.label(sport,team)} | ${labels[sport]} | cgrillo`;
            const teamGames=games.filter(match=>matchesTeam(match.home,teamId)||matchesTeam(match.away,teamId));
            const groups=(data.groups||[]).filter(group=>(group.matches||[]).some(match=>matchesTeam(match.home,teamId)||matchesTeam(match.away,teamId))).map(group=>({...group,matches:group.matches.filter(match=>matchesTeam(match.home,teamId)||matchesTeam(match.away,teamId))}));
            let mode='total',scope='season',archive,archiveRequested=false,index=SportsUI.initialGroupIndex(groups);
            host.innerHTML=`${back}<section class="viewer-dashboard" data-team-dashboard></section><div class="viewer-section-head"><h3>Player performances</h3><div class="sports-tabs viewer-mode" role="group" aria-label="Player statistics calculation"><button type="button" data-mode="total" aria-pressed="true">Total</button><button type="button" data-mode="average" aria-pressed="false">Average</button></div></div><div data-team-leaders></div><section class="viewer-team-fixtures fixtures-card"><div class="fixtures-card__head"><h3>${sport==='tennis'?'Tournament games':'Team fixtures'}</h3><div class="round-selector"><button type="button" data-view-prev aria-label="Previous selection">‹</button><span class="round-selector__value" data-view-round></span><button type="button" data-view-next aria-label="Next selection">›</button></div></div><input type="range" class="round-slider" data-view-slider aria-label="Choose team round or date"><div data-view-games></div></section>`;
            const records=stats?teamGames.map(match=>stats.matches?.[match.id]).filter(Boolean):[];
            const scopes=doc.createElement('div');scopes.className='viewer-scope';scopes.setAttribute('role','group');scopes.setAttribute('aria-label','Dashboard time range');
            scopes.innerHTML=`<button type="button" data-scope="season" aria-pressed="true">${esc(data.seasonLabel||data.season)} season</button><button type="button" data-scope="career" aria-pressed="false">All time</button>`;
            host.querySelector('[data-team-dashboard]').before(scopes);
            const renderSummary=()=>{
                scopes.querySelectorAll('[data-scope]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scope===scope)));
                host.querySelector('[data-team-leaders]').hidden=scope==='career';
                host.querySelector('.viewer-mode').parentElement.hidden=scope==='career';
                host.querySelector('.viewer-team-fixtures').hidden=scope==='career';
                if(scope==='career') {host.querySelector('[data-team-dashboard]').innerHTML=careerMarkup(data,team,archive);return;}
                host.querySelector('[data-team-dashboard]').innerHTML=dashboard(data,team,mode) + '<p class="viewer-note">Scope: all published fixture games, including preseason and postseason where listed. This view may differ from the regular-season ladder.</p>';
                host.querySelector('[data-team-leaders]').innerHTML=stats?`<p class="viewer-note">${esc(coverage(stats,teamGames,records))} ${mode==='average'?'Averages use each player’s recorded appearances for each statistic.':''}</p>${leadersMarkup(stats,records,{team:team.id||team.name,mode,sport})}`:'<p class="viewer-note">Individual statistics are not available for this competition. The dashboard uses published game results.</p>';
                host.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
            };
            const slider=host.querySelector('[data-view-slider]');slider.min='0';slider.max=String(Math.max(0,groups.length-1));slider.disabled=groups.length<2;
            const renderGames=()=>{const group=groups[index];slider.value=String(index);host.querySelector('[data-view-round]').textContent=group?.label||'No fixtures';slider.setAttribute('aria-valuetext',group?.label||'No fixtures');host.querySelector('[data-view-prev]').disabled=index===0;host.querySelector('[data-view-next]').disabled=index>=groups.length-1;FixtureSlider.update(slider,groups.map((group,value)=>({value,label:group.label,date:group.startDate})));host.querySelector('[data-view-games]').innerHTML=(group?.matches||[]).map(match=>SportsUI.renderMatch(match,sport)).join('');};
            host.querySelector('[data-view-prev]').addEventListener('click',()=>{index=Math.max(0,index-1);renderGames();});
            host.querySelector('[data-view-next]').addEventListener('click',()=>{index=Math.min(groups.length-1,index+1);renderGames();});
            slider.addEventListener('input',()=>{index=Math.max(0,Math.min(groups.length-1,Number(slider.value)));renderGames();});
            host.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.mode;renderSummary();}));
            scopes.querySelectorAll('[data-scope]').forEach(button=>button.addEventListener('click',async()=>{
                scope=button.dataset.scope;
                if(scope==='career'&&!archiveRequested){archiveRequested=true;host.querySelector('[data-team-dashboard]').innerHTML='<p class="viewer-note">Loading historical records…</p>';archive=await json(`sports-data/${sport}-careers.json`).catch(()=>null);}
                renderSummary();
            }));
            renderSummary();renderGames();
        } catch(error) {host.innerHTML=`<h2>This view is unavailable</h2><p class="viewer-note">${esc(error.message)}</p><a href="${sport}.html">Return to ${labels[sport]} fixtures →</a>`;}
    }
    return {labels,canonical,teamUrl,matchUrl,teamSummary,aggregate,normalizeAFL,leadersMarkup,matchPerformance,careerMarkup,load,statistics,roundTallies,initPage};
});
