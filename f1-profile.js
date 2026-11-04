(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.F1Profile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const escape = input => String(input ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const numeric = input => input !== null && input !== undefined && input !== '' && Number.isFinite(Number(input)) ? Number(input) : null;
    const driverName = entry => [entry?.driver?.name, entry?.driver?.surname].filter(Boolean).join(' ') || String(entry?.driverId || 'Driver').replaceAll('_', ' ');
    const position = row => numeric(row.position) > 0 ? Number(row.position) : null;
    const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const format = value => value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
    function href(kind, id, options = {}) {
        const query = new URLSearchParams();
        if (options.round != null) query.set('round', options.round);
        if (options.session) query.set('session', options.session);
        if (options.tab) query.set('tab', options.tab);
        if (options.scope === 'all') query.set('scope', 'all');
        if ((kind === 'driver' || kind === 'team') && id) query.set(kind, id);
        return `f1.html${query.size ? `?${query}` : ''}`;
    }
    function includes(selection, row) {
        return selection?.kind === 'driver' ? row.driverId === selection.id : selection?.kind === 'team' && row.teamId === selection.id;
    }
    function build({kind, id, season, races = [], weekends = {}, drivers = [], constructors = [], teamName = id => id}) {
        const selection = {kind, id};
        const standing = kind === 'driver' ? drivers.find(row => row.driverId === id) : constructors.find(row => row.teamId === id);
        const records = [];
        for (const race of races) {
            const sessions = {...weekends[race.raceId]?.sessions, race};
            for (const [key, session] of Object.entries(sessions)) {
                for (const result of session.results || []) {
                    if (includes(selection, result)) records.push({race, session: key, result});
                }
            }
        }
        const raceRecords = records.filter(item => item.session === 'race');
        const sprintRecords = records.filter(item => item.session === 'sprint');
        const qualifying = records.filter(item => item.session === 'qualifying');
        const known = standing || records[0]?.result;
        if (!known) return null;
        const validPositions = raceRecords.map(item => position(item.result)).filter(value => value !== null);
        const points = rows => rows.map(item => numeric(item.result.points)).filter(value => value !== null);
        const racePoints = points(raceRecords), sprintPoints = points(sprintRecords);
        const gains = raceRecords.flatMap(item => {
            const grid = numeric(item.result.grid), finish = position(item.result);
            return grid > 0 && finish !== null ? [grid - finish] : [];
        });
        const best = [...raceRecords].filter(item => position(item.result) !== null).sort((a, b) => position(a.result) - position(b.result) || (numeric(b.result.points) || 0) - (numeric(a.result.points) || 0) || Number(b.race.round) - Number(a.race.round))[0];
        const roster = new Map();
        for (const record of raceRecords) {
            const driver = record.result;
            if (!roster.has(driver.driverId)) roster.set(driver.driverId, {id: driver.driverId, name: driverName(driver), points: 0, starts: 0});
            const person = roster.get(driver.driverId);
            person.points += numeric(driver.points) || 0;
            person.starts++;
        }
        const sum = values => values.length ? values.reduce((a,b)=>a+b,0) : null;
        return {
            ...selection, season, name: kind === 'driver' ? driverName(known) : teamName(id), teamId: kind === 'driver' ? standing?.teamId || records.at(-1)?.result.teamId : id,
            standing, records, raceRecords, best, roster: [...roster.values()],
            weekends: new Set(raceRecords.map(item => item.race.raceId)).size,
            completedRaces: races.filter(race => race.results?.length).length,
            totals: [
                ['Grand Prix points', sum(racePoints)], ['Sprint points', sum(sprintPoints)],
                ['Grand Prix wins', raceRecords.filter(item => position(item.result) === 1).length],
                ['Podiums', raceRecords.filter(item => position(item.result) > 0 && position(item.result) <= 3).length],
                ['Qualifying poles', qualifying.filter(item => position(item.result) === 1).length],
                ['Race fastest laps', raceRecords.filter(item => item.race.fastestLap?.driverId === item.result.driverId).length]
            ],
            averages: [
                ['GP points / driver result', mean(racePoints)], ['Sprint points / driver result', mean(sprintPoints)],
                ['Classified GP position', mean(validPositions)],
                ['Qualifying position', mean(qualifying.map(item => position(item.result)).filter(value => value !== null))],
                ['Places gained / GP', mean(gains)],
                ['Driver results / weekend', new Set(raceRecords.map(item => item.race.raceId)).size ? raceRecords.length / new Set(raceRecords.map(item => item.race.raceId)).size : null]
            ]
        };
    }
    function renderSeasonMarkup(profile, mode = 'total', options = {}) {
        if (!profile) return '<p class="f1-profile__empty">This driver or constructor is not in the published season data. <a href="f1.html">Return to all races</a></p>';
        const link = (kind, id, label, extra = {}) => `<a data-f1-profile-link href="${escape(href(kind, id, {...options, ...extra}))}">${escape(label)}</a>`;
        const best = profile.best;
        const average = mode === 'average';
        const metrics = average ? profile.averages : profile.totals;
        const standing = profile.standing;
        const available = `${profile.weekends} of ${profile.completedRaces} published Grand Prix classifications represented`;
        const bestResult = best ? `<a class="f1-profile__best" href="${escape(href(profile.kind, profile.id, {...options, round: best.race.round, session:'race'}))}"><span>Best Grand Prix finish</span><strong>P${escape(best.result.position)} · ${escape(best.race.name)}</strong><small>${escape(driverName(best.result))} · Round ${escape(best.race.round)}</small></a>` : '<p class="f1-profile__empty">Best performances appear once results are published.</p>';
        return `<div class="f1-profile__top"><span class="f1-profile__eyebrow">${escape(profile.season || '')} · ${profile.kind === 'driver' ? 'Driver' : 'Constructor'} dashboard</span><a class="f1-profile__close" href="${escape(href(null,null,options))}" data-f1-profile-close>All races ×</a></div><div class="f1-profile__identity"><span class="f1-profile__badge" data-profile-identity="${escape(profile.id)}" data-profile-kind="${profile.kind}" aria-hidden="true">${escape(profile.kind === 'driver' ? standing?.driver?.number || 'F1' : 'F1')}</span><div><h2 id="f1-profile-heading" tabindex="-1">${escape(profile.name)}</h2><p>${profile.kind === 'driver' ? link('team',profile.teamId,profile.teamId ? options.teamName?.(profile.teamId) || profile.teamId : 'Constructor unavailable') : 'World Constructors’ Championship'}${standing ? ` · ${profile.kind === 'driver' ? 'WDC' : 'WCC'} P${escape(standing.position)} · ${escape(standing.points)} points` : ''}</p></div></div><div class="f1-profile__mode" role="group" aria-label="Season statistics display"><button type="button" data-profile-mode="total" aria-pressed="${!average}">Totals</button><button type="button" data-profile-mode="average" aria-pressed="${average}">Averages</button></div><dl class="f1-profile__metrics">${metrics.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(format(value))}</dd></div>`).join('')}</dl><p class="f1-profile__coverage">${escape(available)}. ${average ? 'Averages use only supplied values; position averages exclude unclassified results. ' : ''}Championship points above are the official standing; these statistics use available race and session classifications.</p>${bestResult}${profile.kind === 'team' && profile.roster.length ? `<div class="f1-profile__roster"><h3>Drivers · Grand Prix ${average ? 'points per result' : 'points'}</h3>${[...profile.roster].sort((a,b)=>(average ? b.points/b.starts-a.points/a.starts : b.points-a.points)).map(person=>`<div>${link('driver',person.id,person.name)}<strong>${format(average ? person.points/person.starts : person.points)}</strong></div>`).join('')}</div>` : ''}<p class="f1-profile__hint">Use the round slider below for this ${profile.kind === 'driver' ? 'driver’s' : 'constructor’s'} weekend performances. Select any driver or team name to explore their season.</p>`;
    }
    function scopeButtons(profile, scope) {
        return `<div class="f1-profile__scope" role="group" aria-label="Statistics time period"><button type="button" data-profile-scope="season" aria-pressed="${scope !== 'all'}">${escape(profile?.season || 'Current season')}</button><button type="button" data-profile-scope="all" aria-pressed="${scope === 'all'}">All time</button></div>`;
    }
    function renderCareerMarkup(profile, career, mode, options) {
        const average=mode==='average';
        const selection=profile.kind==='driver'?'Driver':'Constructor';
        const header=`<div class="f1-profile__top"><span class="f1-profile__eyebrow">All time · ${selection} dashboard</span><a class="f1-profile__close" href="${escape(href(null,null,{...options,scope:'season'}))}" data-f1-profile-close>All races ×</a></div><div class="f1-profile__identity"><span class="f1-profile__badge" data-profile-identity="${escape(profile.id)}" data-profile-kind="${profile.kind}" aria-hidden="true">${escape(profile.kind==='driver'?profile.standing?.driver?.number||'F1':'F1')}</span><div><h2 id="f1-profile-heading" tabindex="-1">${escape(profile.name)}</h2><p>Formula 1 World Championship career</p></div></div>${scopeButtons(profile,'all')}`;
        if(!career)return `${header}<p class="f1-profile__empty">Historical records for this ${profile.kind} could not be loaded. Current-season statistics remain available in the ${escape(profile.season)} view.</p>`;
        const values=average?[
            ['Grand Prix win rate',career.averages.winRate===null?'—':`${career.averages.winRate.toFixed(1)}%`],
            ['Podiums / GP start',career.averages.podiumsPerStart===null?'—':career.averages.podiumsPerStart.toFixed(2)],
            ['Classified finish position',format(career.averages.finish)],['Grid position',format(career.averages.grid)]
        ]:[['Grand Prix starts',career.totals.starts],['Grand Prix wins',career.totals.wins],['Podium finishes',career.totals.podiums],['Pole starts',career.totals.poleStarts],[profile.kind==='driver'?'World Drivers’ titles':'World Constructors’ titles',career.totals.titles],['Grand Prix entries',career.totals.entries]];
        const championships=career.titleYears?.length?`<div><span>${profile.kind==='driver'?'World Drivers’ Championships':'World Constructors’ Championships'}</span><strong>${career.totals.titles}</strong><p>${career.titleYears.map(escape).join(' · ')}</p></div>`:'';
        const bestChampionship=career.bestChampionship?`<div><span>Best completed championship</span><strong>P${escape(career.bestChampionship.position)}</strong><p>${escape(career.bestChampionship.season)}</p></div>`:'';
        const bestSeason=[...(career.seasons||[])].sort((a,b)=>b.wins-a.wins||b.season-a.season)[0];
        const seasonAchievement=bestSeason&&bestSeason.wins>0?`<div><span>Most Grand Prix wins in a season</span><strong>${escape(bestSeason.wins)}</strong><p>${escape(bestSeason.season)}${bestSeason.complete?'':' · season in progress'}</p></div>`:'';
        const best=career.bestResult;
        const bestRace=best?`<div><span>Best Grand Prix finish</span><strong>P${escape(best.position)}</strong><p>${escape(best.race)} · ${escape(best.season)}${profile.kind==='team'?` · ${escape(best.driverName)}`:''}</p></div>`:'';
        const history=(career.seasons||[]).length?`<details class="f1-profile__history"><summary>Career by season · ${career.seasons.length} seasons</summary><div tabindex="0" role="region" aria-label="Career by season table"><table><caption class="sr-only">${escape(profile.name)} career by season</caption><thead><tr><th scope="col">Season</th><th scope="col">GP starts</th><th scope="col">Wins</th><th scope="col">Podiums</th><th scope="col">${profile.kind==='driver'?'WDC':'WCC'}</th></tr></thead><tbody>${career.seasons.map(year=>`<tr><th scope="row">${escape(year.season)}${!year.complete?'*':''}</th><td>${escape(year.starts)}</td><td>${escape(year.wins)}</td><td>${escape(year.podiums)}</td><td>${year.championship?`P${escape(year.championship)}`:'—'}</td></tr>`).join('')}</tbody></table></div><p class="f1-profile__coverage">* Season in progress. Championship ranks and titles use completed seasons only.</p></details>`:'';
        const source=/^https:\/\//.test(career.source||'')?`<a href="${escape(career.source)}" target="_blank" rel="noopener noreferrer">Jolpica historical results ↗</a>`:'Jolpica F1';
        const updated=Number.isFinite(Date.parse(career.updatedAt))?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',year:'numeric'}).format(new Date(career.updatedAt)):'';
        return `${header}<div class="f1-profile__mode" role="group" aria-label="Career statistics display"><button type="button" data-profile-mode="total" aria-pressed="${!average}">Totals</button><button type="button" data-profile-mode="average" aria-pressed="${average}">Averages</button></div><dl class="f1-profile__metrics">${values.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><h3 class="f1-profile__achievements-title">Career achievements</h3><div class="f1-profile__achievements">${championships}${bestChampionship}${seasonAchievement}${bestRace}${!championships&&!bestChampionship&&!bestRace?'<p>No Grand Prix or completed championship achievements are recorded yet.</p>':''}</div><p class="f1-profile__coverage">${career.firstSeason?`${escape(career.firstSeason)}–${escape(career.lastSeason)} published Grand Prix records. `:''}${escape(career.scope)} Grand Prix starts exclude DNS, withdrawals and non-qualifiers. Pole starts refer to the published starting grid. Sprints are excluded; historical points systems are not compared.${career.stale?' Showing the last saved historical update.':''}${career.complete===false?' Championship coverage is incomplete; achievements may be understated.':''}</p>${history}<p class="f1-profile__coverage">Source: ${source}${updated?` · Updated ${escape(updated)} Sydney time`:''}.</p><p class="f1-profile__hint">The round slider below continues to show ${escape(profile.season)} weekend performances. Switch back to ${escape(profile.season)} above for current-season totals and averages.</p>`;
    }
    function renderMarkup(profile, mode='total', options={}) {
        if(!profile)return renderSeasonMarkup(profile,mode,options);
        if(options.scope==='all')return renderCareerMarkup(profile,options.career,mode,options);
        return renderSeasonMarkup(profile,mode,options).replace('<div class="f1-profile__mode"',`${scopeButtons(profile,'season')}<div class="f1-profile__mode"`);
    }
    function renderSessionMarkup(selection, race, sessionKey, session, teamName = id=>id) {
        const results = (session.results || []).filter(result=>includes(selection,result));
        const labels = {race:'Race',sprint:'Sprint',qualifying:'Qualifying',sq:'Sprint qualifying',fp1:'Practice 1',fp2:'Practice 2',fp3:'Practice 3'};
        const label = labels[sessionKey] || sessionKey;
        if (!results.length) return `<section class="f1-profile-session"><h3>${escape(label)} · Selected ${selection.kind}</h3><p>No published result for this ${escape(selection.kind)} in this session.</p></section>`;
        return `<section class="f1-profile-session"><h3>${escape(label)} · ${selection.kind === 'driver' ? 'Driver performance' : escape(teamName(selection.id))}</h3>${results.map(result=>{
            const grid = String(result.grid ?? '');
            const gridLabel = /^(pit[ -]lane|pl)$/i.test(grid) ? 'Pit lane' : numeric(grid) > 0 ? grid : '—';
            const fields = [['Position',result.position || '—'],['Best lap',result.fastLap || result.bestLap || '—']];
            if (sessionKey === 'race' || sessionKey === 'sprint') fields.push(['Grid',gridLabel],['Points',numeric(result.points) ?? '—'],['Time / status',result.retired && !['0','false'].includes(String(result.retired)) ? typeof result.retired === 'string' && !['1','true'].includes(result.retired) ? result.retired : 'DNF' : result.time || '—']);
            else fields.push(['Laps completed',result.lapsCompleted ?? '—']);
            return `<div class="f1-profile-session__driver"><a data-f1-profile-link href="${escape(href('driver',result.driverId,{round:race.round,session:sessionKey}))}">${escape(driverName(result))}</a><dl>${fields.map(([name,value])=>`<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></div>`;
        }).join('')}</section>`;
    }
    return {build, href, includes, renderMarkup, renderSessionMarkup};
});
