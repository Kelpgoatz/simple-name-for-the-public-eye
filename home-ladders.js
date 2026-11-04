(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else api.init(document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DAY = 86400000;
    function seasonWindow(data) {
        const matches = Array.isArray(data) ? data.flatMap(round => round.matches || [])
            : data.races ? data.races : (data.groups || []).flatMap(group => group.matches || []);
        const times = matches.map(match => Date.parse(match.startTime || match.date)).filter(Number.isFinite);
        const start = Date.parse(data.seasonStart);
        const end = Date.parse(data.seasonEnd);
        const finals = matches.filter(match => match.roundLabel === 'Postseason' && match.status === 'final');
        const complete = finals.length && matches.every(match => ['final', 'cancelled'].includes(match.status));
        const finalEnd = complete ? Math.max(...finals.map(match => Date.parse(match.startTime)).filter(Number.isFinite)) + 3 * 3600000 : NaN;
        return { start: Number.isFinite(start) ? start : times.length ? Math.min(...times) : NaN,
            end: Number.isFinite(finalEnd) ? finalEnd : Number.isFinite(end) ? end : times.length ? Math.max(...times) + 3 * 3600000 : NaN };
    }
    function isSeasonVisible(data, now = Date.now()) {
        const { start, end } = seasonWindow(data);
        return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end + 10 * DAY;
    }
    function cardsFor(sources, now = Date.now(), includeSports = []) {
        const cards = [];
        const add = (id, title, href, rows, season, type, calendar) => {
            const sport=['wdc','wcc'].includes(id)?'f1':id.split('-')[0];
            if (rows?.length && calendar && (isSeasonVisible(calendar, now)||includeSports.includes(sport))) cards.push({ id, title, href, rows, season, type, sport, seasonEnd: seasonWindow(calendar).end, ended: now > seasonWindow(calendar).end });
        };
        add('afl', 'AFL', 'afl.html', sources.aflStandings?.map(row => ({ rank: row.rank, name: row.name, identity: row.name, stat: `${row.pts} pts` })),
            sources.aflFixtures?.flatMap(round => round.matches || []).find(match => match.startTime)?.startTime?.slice(0, 4), 'afl', sources.aflFixtures);
        const fixtures = sources.f1;
        if (fixtures) {
            if (Number(sources.drivers?.season) === Number(fixtures.season)) add('wdc', 'F1 WDC', 'f1.html', sources.drivers.drivers_championship?.map(row => ({ rank: row.position, name: [row.driver.name, row.driver.surname].join(' '), identity: row.driverId, stat: `${row.points} pts`, fallback: row.driver.shortName || row.driver.number })), fixtures.season, 'drivers', fixtures);
            if (Number(sources.constructors?.season) === Number(fixtures.season)) add('wcc', 'F1 WCC', 'f1.html?tab=constructors', sources.constructors.constructors_championship?.map(row => ({ rank: row.position, name: row.team.teamName, identity: row.teamId, stat: `${row.points} pts`, fallback: row.teamId.slice(0, 3).toUpperCase() })), fixtures.season, 'constructors', fixtures);
        }
        for (const slug of ['aflw', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl']) {
            const data = sources[slug];
            if (!data) continue;
            for (const group of data.standings || []) {
                const conference = ['nba', 'wnba'].includes(slug) && data.standings.length > 1 ? /western/i.test(group.label) ? 'West' : 'East' : slug === 'nfl' ? /national/i.test(group.label) ? 'NFC' : 'AFC' : '';
                add(`${slug}-${group.id}`, `${slug.toUpperCase()}${conference ? ' ' + conference : ''}`, `${slug}.html?standing=${encodeURIComponent(group.id)}`,
                    group.rows.map(row => ({ rank: row.rank, name: row.team.name, teamId:row.team.id, image: row.team.logo, fallback: row.team.abbreviation, stat: ['aflw', 'nrl', 'nrlw'].includes(slug) ? `${row.points ?? '–'} pts` : `${row.wins ?? '–'}–${row.losses ?? '–'}${row.draws ? '–' + row.draws : ''}` })), data.seasonLabel, 'team', data);
            }
        }
        if (sources.f2 && includeSports.includes('f2')) {
            const data=sources.f2,calendar={seasonStart:data.races?.[0]?.startDate,seasonEnd:data.races?.at(-1)?.endDate};
            add('f2-drivers','F2 Drivers','f2.html',data.drivers?.map(row=>({rank:row.rank,name:row.name,identity:row.id,driverId:row.id,image:row.flagUrl,stat:`${row.points} pts`,href:`f2.html?driver=${encodeURIComponent(row.id)}`})),data.season,'f2-driver',calendar);
            add('f2-teams','F2 Teams','f2.html?standing=teams',data.teams?.map(row=>({rank:row.rank,name:row.name,teamId:row.id,image:row.teamImage,stat:`${row.points} pts`,href:`f2.html?team=${encodeURIComponent(row.id)}`})),data.season,'f2-team',calendar);
        }
        return cards;
    }
    function rowFollowed(card,row,prefs) {
        const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const target=card.type==='drivers'||card.type==='f2-driver'?prefs.drivers||[]:prefs.teams||[];
        return target.some(item=>item.sport===card.sport&&[row.teamId,row.driverId,row.identity,row.name].filter(Boolean).some(value=>clean(value)===clean(item.id)));
    }
    function preferredLadders(cards,prefs={},now=Date.now()) {
        const sports=[...new Set([...(prefs.leagues||[]),...(prefs.teams||[]).map(item=>item.sport),...(prefs.drivers||[]).map(item=>item.sport)])];
        if(!sports.length)return chooseLadders(cards,now);
        return chooseLadders(cards.filter(card=>sports.includes(card.sport)),now,Infinity).flatMap(choice=>{
            const matching=choice.views.filter(view=>view.rows.some(row=>rowFollowed(view,row,prefs)));
            return matching.length?matching.map(view=>({...choice,sport:`${choice.sport}:${view.id}`,views:[view]})):[choice];
        });
    }
    function chooseLadders(cards, now = Date.now(), limit = 6) {
        const sports = new Map();
        for (const card of cards) {
            if (!sports.has(card.sport)) sports.set(card.sport, { sport: card.sport, seasonEnd: card.seasonEnd, views: [] });
            sports.get(card.sport).views.push(card);
        }
        const women = sport => ['aflw', 'nrlw', 'wnba'].includes(sport) ? 1 : 0;
        return [...sports.values()].sort((a, b) => women(a.sport) - women(b.sport) || Math.abs(a.seasonEnd - now) - Math.abs(b.seasonEnd - now) || a.sport.localeCompare(b.sport)).slice(0, limit);
    }
    const randomView = (views, random = Math.random) => views[Math.min(views.length - 1, Math.floor(random() * views.length))];
    function init(doc) {
        const sidebar = doc.querySelector('[data-home-ladders]');
        if (!sidebar) return;
        const files = { aflStandings: 'standings.json', aflFixtures: 'afl-fixtures.json', f1: 'f1-fixtures.json', f2:'f2-data.json', drivers: 'drivers-championship.json', constructors: 'constructors-championship.json', aflw: 'sports-data/aflw.json', nrl: 'sports-data/nrl.json', nrlw: 'sports-data/nrlw.json', nba: 'sports-data/nba.json', wnba: 'sports-data/wnba.json', nbl: 'sports-data/nbl.json', nfl: 'sports-data/nfl.json' };
        let sources = {};
        const selectedViews = new Map();
        const text = (tag, cls, value, parent) => { const node = doc.createElement(tag); node.className = cls; node.textContent = value; parent.appendChild(node); return node; };
        const render = () => {
            const prefs=typeof ViewerFavourites!=='undefined'?ViewerFavourites.get():{leagues:[],teams:[],drivers:[]};
            const wanted=[...(prefs.leagues||[]),...(prefs.teams||[]).map(item=>item.sport),...(prefs.drivers||[]).map(item=>item.sport)];
            const cards = preferredLadders(cardsFor(sources,Date.now(),wanted),prefs);
            sidebar.replaceChildren();
            for (const choice of cards) {
                if (!choice.views.some(view => view.id === selectedViews.get(choice.sport))) selectedViews.set(choice.sport, randomView(choice.views).id);
                const link = doc.createElement('section'); link.className = 'ladder-card home-ladder';
                const paint = () => {
                const card = choice.views.find(view => view.id === selectedViews.get(choice.sport));
                link.replaceChildren();
                link.setAttribute('aria-label', `${card.title} standings, ${card.season}`);
                const head = text('div', 'ladder-card__head', '', link);
                text('h3', '', card.title, head);
                const arrow = text('a', 'ladder-arrow', '→', head);
                arrow.href = card.href;
                arrow.setAttribute('aria-label', `Open ${card.title} standings`);
                const followedRows=card.rows.some(row=>rowFollowed(card,row,prefs));
                text('p', 'home-ladder__season', `${card.season || ''}${card.ended ? ' · Final' : ''}${followedRows?' · Starred teams/drivers first':''}`, link);
                const switching = text('div', 'home-ladder__controls', '', link);
                if (choice.views.length > 1) {
                    const opposite = choice.views[(choice.views.indexOf(card) + 1) % choice.views.length];
                    const button = text('a', 'home-ladder__switch', `Show ${opposite.title}`, switching);
                    button.href = opposite.href;
                    button.setAttribute('aria-label', `Open ${opposite.title} standings`);
                }
                const list = text('div', 'ladder-list', '', link);
                [...card.rows].sort((a, b) => Number(rowFollowed(card,b,prefs))-Number(rowFollowed(card,a,prefs))||Number(a.rank) - Number(b.rank)).forEach(row => {
                    const item = text('div', 'ladder-row', '', list);
                    if(rowFollowed(card,row,prefs))item.classList.add('ladder-row--followed');
                    text('span', 'ladder-row__pos', row.rank ?? '–', item);
                    const badge = text('span', 'ladder-row__logo', row.fallback || row.name.slice(0, 2).toUpperCase(), item);
                    badge.setAttribute('aria-hidden', 'true');
                    if (['drivers','constructors','afl'].includes(card.type)) SportIdentity.apply(badge, card.type, row.identity);
                    else if (/^https:\/\//.test(row.image || '')) {
                        const image = doc.createElement('img'); image.className = 'sport-identity__image'; image.alt = ''; image.loading = 'lazy';
                        badge.classList.add('sport-identity'); image.addEventListener('error', () => image.remove(), { once: true }); image.src = row.image; badge.appendChild(image);
                    }
                    const name = text('a', 'ladder-row__team', TeamNames.label(card.sport,row.name), item); name.title = row.name;
                    name.href = row.href || (card.sport === 'f1' ? `f1.html?${card.type === 'drivers' ? 'driver' : 'team'}=${encodeURIComponent(row.identity)}` : `sport-view.html?sport=${encodeURIComponent(card.sport)}&team=${encodeURIComponent(row.teamId || row.name)}`);
                    text('span', 'ladder-row__stats', row.stat, item);
                });
                };
                paint();
                sidebar.appendChild(link);
            }
            if (!cards.length) text('p', 'ladder-note', 'Season ladders will appear when competitions begin.', sidebar);
        };
        const refresh = async () => {
            await Promise.all(Object.entries(files).map(async ([key, file]) => {
                if(key==='f2' && typeof ViewerFavourites!=='undefined'){const prefs=ViewerFavourites.get();if(!prefs.leagues.includes('f2')&&!prefs.teams.some(team=>team.sport==='f2')&&!prefs.drivers?.some(driver=>driver.sport==='f2'))return;}
                try { const response = await fetch(file, { cache: 'no-cache' }); if (response.ok) sources[key] = await response.json(); } catch {}
            }));
            render();
        };
        refresh();
        window.addEventListener('viewer-favourites-change',refresh);
        setInterval(refresh, 15 * 60000);
    }
    return { seasonWindow, isSeasonVisible, cardsFor, chooseLadders, preferredLadders, rowFollowed, randomView, init };
});
