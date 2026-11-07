(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.HomeSports = api;
        document.addEventListener('error', event => {
            if (event.target.matches?.('.home-sport-logo')) event.target.remove();
        }, true);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const teamNames = typeof module==='object' && module.exports ? require('./team-names.js') : TeamNames;
    const labels = { afl: 'AFL', aflw: 'AFLW', f1: 'F1', nrl: 'NRL', nrlw: 'NRLW', nba: 'NBA', wnba: 'WNBA', nbl: 'NBL', nfl: 'NFL', tennis: 'Tennis · Grand Slam' };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const timeZone = 'Australia/Sydney';
    const hour = 3600000;
    const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const stampFormatter = new Intl.DateTimeFormat('en-AU', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    function dateKey(input) {
        const parts = Object.fromEntries(dateFormatter.formatToParts(input).map(({ type, value }) => [type, value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
    }
    const shiftDate = (key, days) => new Date(Date.parse(`${key}T12:00:00Z`) + days * 24 * hour).toISOString().slice(0, 10);
    function weekRange(now = Date.now()) {
        const today = dateKey(now);
        const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
        const start = shiftDate(today, -((weekday + 6) % 7));
        return { start, end: shiftDate(start, 6) };
    }
    function eventType(game, now = Date.now()) {
        if (game.state.isLive) return 'live';
        if (game.state.isFinished) return 'results';
        if (game.startTime?.getTime() > now && !game.state.isPending && !game.state.isTbc && !['cancelled', 'postponed'].includes(game.match?.status)) return 'upcoming';
        return 'other';
    }
    function uniqueMatches(games) {
        const seen = new Map();
        for (const game of games) {
            const id = game.match?.id ?? game.match?.matchId;
            const key = id == null ? game : `${game.sport || 'afl'}:${id}`;
            const previous = seen.get(key);
            const updated = Date.parse(game.match?.updatedAt);
            const previousUpdated = Date.parse(previous?.match?.updatedAt);
            if (previous && Number.isFinite(previousUpdated) && !(updated >= previousUpdated)) continue;
            if (previous?.state.isFinished && !game.state.isFinished && !(updated > previousUpdated)) continue;
            seen.set(key, game);
        }
        return [...seen.values()];
    }
    function validSnapshot(data,sport){
        return Boolean(data&&typeof data==='object'&&!Array.isArray(data)&&data.sport===sport&&Array.isArray(data.groups)&&data.groups.every(group=>group&&typeof group==='object'&&Array.isArray(group.matches)&&group.matches.every(match=>match&&typeof match==='object'&&!Array.isArray(match))));
    }
    function summaries(data, now = Date.now(), { stale = false } = {}) {
        if (!data || !['aflw', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'tennis'].includes(data.sport)) return [];
        const observed = Date.parse(data.fixturesUpdatedAt || data.updatedAt);
        const fresh = !stale && (!Number.isFinite(observed) || now - observed <= 45 * 60000);
        return uniqueMatches((data.groups || []).flatMap(group => (group.matches || []).flatMap(match => {
            const startTime = match.startTime ? new Date(match.startTime) : null;
            if (!startTime || !Number.isFinite(startTime.getTime())) return [];
            const age = now - startTime.getTime();
            const live = fresh && match.status === 'live' && age >= 0 && age < 8 * hour;
            const overdue = match.status === 'scheduled' && age >= 0;
            return [{ sport: data.sport, match, group, startTime, dateKey: dateKey(startTime), active: live,
                state: { isLive: live, isFinished: match.status === 'final', isPending: overdue },
                staleLive: match.status === 'live' && !live }];
        })));
    }
    const validNumber = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
    function renderCard(game) {
        const { match, group, sport, startTime, state, staleLive } = game;
        const query = new URLSearchParams();
        if (group.id != null) query.set('group', group.id);
        if (sport === 'tennis' && ['atp', 'wta'].includes(match.tour)) query.set('tour', match.tour);
        const url = `${sport}.html${query.size ? '?' + query : ''}`;
        const logo = team => {
            const initials = team.abbreviation || String(team.name || 'TBC').split(/\s+/).map(word => word[0]).join('').slice(0, 3);
            const color = /^#?[0-9a-f]{6}$/i.test(team.color || '') ? `#${team.color.replace(/^#/, '')}` : '#073d2e';
            const image = /^https:\/\//.test(team.logo || '') ? `<img class="home-sport-logo sport-identity__image" src="${escape(team.logo)}" alt="" loading="lazy">` : '';
            return `<span class="afl-game__logo sport-identity" aria-hidden="true" style="--logo-from:${color}">${escape(initials)}${image}</span>`;
        };
        const team = (side, away = false) => {
            const player = match[side] || {};
            const teamUrl = `sport-view.html?sport=${encodeURIComponent(sport)}&team=${encodeURIComponent(player.id || player.name || '')}`;
            const label = escape(teamNames.label(sport, player));
            const name = player.id || player.name ? `<a class="afl-game__name" href="${teamUrl}">${label}</a>` : `<span class="afl-game__name">${label}</span>`;
            return `<div class="afl-game__team${away ? ' afl-game__team--away' : ''}">${away ? name + logo(player) : logo(player) + name}</div>`;
        };
        const scored = (state.isLive || state.isFinished) && validNumber(match.homeScore) && validNumber(match.awayScore);
        const score = side => `<span class="${match.winner === side ? 'afl-game__score-value--win' : 'afl-game__score-value--loss'}">${escape(match[side + 'Score'])}</span>`;
        const status = staleLive || state.isPending ? 'Update pending' : state.isLive ? 'Live' : state.isFinished ? 'Finished' : match.status === 'postponed' ? 'Postponed' : match.status === 'cancelled' ? 'Cancelled' : 'Scheduled';
        const detail = sport === 'tennis' ? match.tour === 'wta' ? 'Women’s singles' : 'Men’s singles' : match.roundLabel || (['nba', 'wnba', 'nbl'].includes(sport) ? '' : group.label);
        const period = state.isLive && match.statusDetail ? `<span class="afl-game__meta-item">${escape(match.statusDetail)}</span>` : '';
        const sets = sport === 'tennis' && (state.isLive || state.isFinished) && Array.isArray(match.sets) && match.sets.length ? `Sets ${match.sets.map(set => `${set?.home ?? '–'}–${set?.away ?? '–'}`).join(', ')}` : '';
        const centre = match.id == null ? url : `sport-view.html?sport=${encodeURIComponent(sport)}&match=${encodeURIComponent(match.id)}`;
        return `<article class="afl-game home-sport-game" data-sport="${sport}">${team('home')}<div class="afl-game__score">${scored ? score('home') : ''}<span class="afl-game__vs">vs</span>${scored ? score('away') : ''}</div>${team('away', true)}<div class="afl-game__meta"><a class="afl-game__meta-item home-match-date" href="${escape(url)}"><time datetime="${startTime.toISOString()}">${escape(stampFormatter.format(startTime))}</time></a>${detail ? `<span class="afl-game__meta-item">${escape(detail)}</span>` : ''}${match.venue ? `<span class="afl-game__meta-item">${escape(match.venue)}</span>` : ''}<span class="afl-game__status afl-game__status--${state.isLive ? 'live' : state.isFinished ? 'finished' : status === 'Scheduled' ? 'scheduled' : 'tbc'}">${status}</span>${period}${sets ? `<span class="afl-game__meta-item">${escape(sets)}</span>` : ''}<a class="home-game-centre" href="${escape(centre)}">${match.id == null ? 'Competition' : 'Game centre'} →</a></div></article>`;
    }
    function dayCategory(game, now = Date.now()) {
        const today = dateKey(new Date(now));
        const shift = days => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
        if (!game.startTime) return null;
        const age = now - new Date(game.startTime).getTime();
        if (!Number.isFinite(age)) return null;
        const hour = 3600000;
        const basketball = ['nba', 'wnba'].includes(game.sport);
        const limit = (basketball ? 16 : 24) * hour;
        if (game.state.isLive && age >= 0 && age < 48 * hour) return 'today';
        if (Math.abs(age) <= 3 * hour) return 'today';
        if (age < -3 * hour && age >= -limit && !game.state.isFinished && !['cancelled', 'postponed'].includes(game.match?.status)) return 'upcoming';
        if (game.dateKey === shift(-1) && (!basketball || age <= limit)) return 'yesterday';
        return null;
    }
    function leagueLayout(games, sport, now = Date.now(), { chronological = false } = {}) {
        const ordered = [...games];
        if (sport === 'f1' || ordered.length % 2 === 0) return { games: ordered, expanded: null };
        if (chronological) return { games: ordered, expanded: ordered[0] };
        let closest = 0;
        let distance = Infinity;
        ordered.forEach((game, index) => {
            const time = game.startTime == null ? NaN : new Date(game.startTime).getTime();
            if (Number.isFinite(time) && Math.abs(time - now) < distance) {
                closest = index;
                distance = Math.abs(time - now);
            }
        });
        const expanded = ordered.splice(closest, 1)[0];
        ordered.unshift(expanded);
        return { games: ordered, expanded };
    }
    return { labels, dateKey, weekRange, eventType, uniqueMatches, summaries, renderCard, dayCategory, leagueLayout, validSnapshot };
});
