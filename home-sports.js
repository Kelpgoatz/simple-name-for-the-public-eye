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
    const dateKey = input => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(input);
    function summaries(data, now = Date.now()) {
        if (!data || !['aflw', 'nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'tennis'].includes(data.sport)) return [];
        return (data.groups || []).flatMap(group => (group.matches || []).flatMap(match => {
            const startTime = match.startTime ? new Date(match.startTime) : null;
            if (!startTime || !Number.isFinite(startTime.getTime())) return [];
            const live = match.status === 'live' && now - startTime.getTime() < 48 * 3600000;
            return [{ sport: data.sport, match, group, startTime, dateKey: dateKey(startTime), active: live,
                state: { isLive: live, isFinished: match.status === 'final', isPending: false },
                staleLive: match.status === 'live' && !live }];
        }));
    }
    const validNumber = value => value != null && value !== '' && Number.isFinite(Number(value));
    function renderCard(game) {
        const { match, group, sport, startTime, state, staleLive } = game;
        const url = `${sport}.html?group=${encodeURIComponent(group.id)}${sport === 'tennis' && ['atp', 'wta'].includes(match.tour) ? `&tour=${match.tour}` : ''}`;
        const logo = team => {
            const initials = team.abbreviation || String(team.name || 'TBC').split(/\s+/).map(word => word[0]).join('').slice(0, 3);
            const color = /^#?[0-9a-f]{6}$/i.test(team.color || '') ? `#${team.color.replace(/^#/, '')}` : '#073d2e';
            const image = /^https:\/\//.test(team.logo || '') ? `<img class="home-sport-logo sport-identity__image" src="${escape(team.logo)}" alt="" loading="lazy">` : '';
            return `<span class="afl-game__logo sport-identity" aria-hidden="true" style="--logo-from:${color}">${escape(initials)}${image}</span>`;
        };
        const team = (side, away = false) => {
            const player = match[side] || {};
            const teamUrl = `sport-view.html?sport=${encodeURIComponent(sport)}&team=${encodeURIComponent(player.id || player.name || '')}`;
            const name = `<a class="afl-game__name" href="${teamUrl}">${escape(teamNames.label(sport,player))}</a>`;
            return `<div class="afl-game__team${away ? ' afl-game__team--away' : ''}">${away ? name + logo(player) : logo(player) + name}</div>`;
        };
        const scored = ['live', 'final'].includes(match.status) && validNumber(match.homeScore) && validNumber(match.awayScore);
        const score = side => `<span class="${match.winner === side ? 'afl-game__score-value--win' : 'afl-game__score-value--loss'}">${escape(match[side + 'Score'])}</span>`;
        const time = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(startTime);
        const status = staleLive ? 'Update pending' : state.isLive ? 'Live' : state.isFinished ? 'Finished' : match.status === 'postponed' ? 'Postponed' : match.status === 'cancelled' ? 'Cancelled' : 'Scheduled';
        const detail = sport === 'tennis' ? match.tour === 'wta' ? 'Women’s singles' : 'Men’s singles' : ['nba', 'wnba', 'nbl'].includes(sport) ? '' : group.label;
        const sets = sport === 'tennis' && match.sets?.length ? ` · Sets: ${match.sets.map(set => `${set.home ?? '–'}–${set.away ?? '–'}`).join(', ')}` : '';
        return `<article class="afl-game home-sport-game" data-sport="${sport}">${team('home')}<div class="afl-game__score">${scored ? score('home') : ''}<span class="afl-game__vs">vs</span>${scored ? score('away') : ''}</div>${team('away', true)}<div class="afl-game__meta"><a class="afl-game__meta-item home-match-date" href="${url}">${escape(time)}</a>${detail ? `<span class="afl-game__meta-item">${escape(detail)}</span>` : ''}${match.venue ? `<span class="afl-game__meta-item">${escape(match.venue)}</span>` : ''}<span class="afl-game__status afl-game__status--${state.isLive ? 'live' : state.isFinished ? 'finished' : 'scheduled'}">${status}</span>${sets ? `<span class="afl-game__meta-item">${escape(sets.slice(3))}</span>` : ''}<a class="home-game-centre" href="sport-view.html?sport=${encodeURIComponent(sport)}&match=${encodeURIComponent(match.id)}">Game centre →</a></div></article>`;
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
    function leagueLayout(games, sport, now = Date.now()) {
        const ordered = [...games];
        if (sport === 'f1' || ordered.length % 2 === 0) return { games: ordered, expanded: null };
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
    return { labels, summaries, renderCard, dayCategory, leagueLayout };
});
