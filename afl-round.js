(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AFLRoundView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const categories = { disposals: 'Total disposals', handballs: 'Handballs', kicks: 'Kicks', goals: 'Goals', marks: 'Marks', tackles: 'Tackles', clearances: 'Clearances', hitouts: 'Hitouts' };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function sortMatches(matches) {
        const time = match => { const value = Date.parse(String(match.startTime || '').replace(/\+0000$/, 'Z')); return Number.isFinite(value) ? value : Infinity; };
        return [...matches].sort((a, b) => time(a) - time(b));
    }
    function matchState(match, now = Date.now()) {
        const status = String(match.status ?? '').toUpperCase();
        const start = Date.parse(String(match.startTime ?? '').replace(/\+0000$/, 'Z'));
        if (['CONCLUDED', 'FINAL', 'FULL_TIME', 'COMPLETED'].includes(status)) return 'finished';
        if (['CANCELLED', 'CANCELED'].includes(status)) return 'cancelled';
        if (['POSTPONED', 'DELAYED', 'SUSPENDED', 'ABANDONED'].includes(status)) return status.toLowerCase();
        if (['LIVE', 'IN_PROGRESS', 'PLAYING'].includes(status)) {
            return Number.isFinite(start) && (start > now || now - start > 4 * 3600000) ? 'pending' : 'live';
        }
        if (['PLACEHOLDER', 'TBC', 'TO_BE_CONFIRMED'].includes(status) || !Number.isFinite(start)) return 'tbc';
        if (start <= now) return 'pending';
        return ['SCHEDULED', 'CONFIRMED_TEAMS', 'UNCONFIRMED_TEAMS'].includes(status) ? 'scheduled' : 'tbc';
    }
    function defaultRound(rounds, now = Date.now()) {
        const live = rounds.find(round => round.matches.some(match => matchState(match, now) === 'live'));
        const next = rounds.find(round => round.matches.some(match => matchState(match, now) === 'scheduled'));
        const latest = rounds.findLast(round => round.matches.some(match => matchState(match, now) === 'finished'));
        return (live || next || latest || rounds[0])?.round;
    }
    function closestFinal(matches, isFinals, now = Date.now()) {
        if (!isFinals || matches.length < 2 || matches.length % 2) return -1;
        let closest = -1;
        let distance = Infinity;
        matches.forEach((match, index) => {
            if (!index) return;
            const time = Date.parse(String(match.startTime || '').replace(/\+0000$/, 'Z'));
            if (Number.isFinite(time) && Math.abs(time - now) < distance) {
                closest = index;
                distance = Math.abs(time - now);
            }
        });
        return closest < 0 ? matches.length - 1 : closest;
    }
    function renderMarkup(data, round, fixtureSeason) {
        const compatible = data && Number(data.season) === Number(fixtureSeason);
        const record = compatible ? data.rounds?.[round] : null;
        const label = record?.label || `Round ${round}`;
        let note = !compatible ? 'Player statistics are temporarily unavailable for this season.'
            : !record ? 'Round statistics have not been published yet.'
            : !record.playedMatches ? 'Player tallies will appear once this round begins.'
            : !record.complete ? 'Incomplete coverage: some match statistics could not be refreshed. Available and previously saved values are shown.'
            : `${record.availableMatches} of ${record.scheduledMatches} matches included${record.pendingMatches ? '; the remaining games have not started' : ''}.`;
        if (Number.isFinite(Date.parse(record?.updatedAt))) note += ` Updated ${new Intl.DateTimeFormat('en-AU', {timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(record.updatedAt))} Sydney time.`;
        const cards = Object.entries(categories).map(([key, title]) => {
            const leaders = Array.isArray(record?.leaders?.[key]) ? record.leaders[key].filter(Boolean) : [];
            return `<section class="afl-stat-card" aria-labelledby="round-stat-${key}"><h3 id="round-stat-${key}">${title}</h3>${leaders.length ? `<ol>${leaders.slice(0, 6).map((player, index) => `<li><span class="afl-stat-rank">${index + 1}</span><span class="afl-stat-club" data-stat-club="${escape(player.teamName)}" aria-hidden="true">${escape(player.teamName?.slice(0, 2).toUpperCase() || '')}</span><span class="afl-stat-player" title="${escape(player.name)} · ${escape(player.teamName)}">${escape(player.name)}<small>${escape(player.teamName)}</small></span><strong>${escape(player.value)}</strong></li>`).join('')}</ol>` : '<p class="afl-stat-empty">No player statistics available yet.</p>'}</section>`;
        }).join('');
        return `<div class="afl-round-tallies__head"><h2 id="afl-round-tallies-title">${escape(label)} · Player leaders</h2><span>Top six · Round totals</span></div><p class="afl-round-tallies__note">${escape(note)}</p><div class="afl-round-tallies__grid">${cards}</div><p class="afl-round-tallies__source">Source: <a href="https://www.afl.com.au/stats" target="_blank" rel="noopener noreferrer">AFL player statistics ↗</a></p>`;
    }
    function render(panel, data, round, fixtureSeason) {
        if (!panel) return;
        panel.innerHTML = renderMarkup(data, round, fixtureSeason);
        panel.querySelectorAll('[data-stat-club]').forEach(badge => SportIdentity.afl(badge, badge.dataset.statClub));
    }
    return { categories, sortMatches, matchState, defaultRound, closestFinal, renderMarkup, render };
});
