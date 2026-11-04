const base = 'https://www.nrl.com';
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

export function nrlStatus(match) {
    const state = String(match.matchState || '').toLowerCase();
    if (/postpone/.test(state)) return 'postponed';
    if (/cancel|abandon/.test(state)) return 'cancelled';
    if (/fulltime|final|complete/.test(state)) return 'final';
    return match.matchMode === 'Live' || /inprogress|halftime|firsthalf|secondhalf|goldenpoint/.test(state) ? 'live' : 'scheduled';
}

function logo(theme) {
    return theme?.key && /^[a-z0-9-]+$/.test(theme.key) ? `${base}/.theme/${theme.key}/badge.svg` : '';
}

export function normalizeNrlMatch(match, teams, round) {
    if (!match.homeTeam?.teamId || !match.awayTeam?.teamId) return null;
    const team = raw => teams.get(String(raw.teamId)) || {
        id: String(raw.teamId), name: raw.fullName || raw.nickName || 'Team TBC',
        abbreviation: raw.nickName || '', logo: logo(raw.theme), color: '#073d2e'
    };
    const status = nrlStatus(match);
    const homeScore = ['live', 'final'].includes(status) ? number(match.homeTeam.score) : null;
    const awayScore = ['live', 'final'].includes(status) ? number(match.awayTeam.score) : null;
    return {
        id: match.matchCentreUrl || `${round}-${match.homeTeam.teamId}-${match.awayTeam.teamId}`,
        startTime: match.clock?.kickOffTimeLong || null, status,
        statusDetail: status === 'final' ? 'Full time' : status === 'live' ? match.clock?.gameTime || 'Live' : status === 'scheduled' ? 'Scheduled' : status,
        venue: [match.venue, match.venueCity].filter(Boolean).join(' · '),
        home: team(match.homeTeam), away: team(match.awayTeam), homeScore, awayScore,
        winner: status !== 'final' || homeScore == null || awayScore == null || homeScore === awayScore ? null : homeScore > awayScore ? 'home' : 'away',
        url: match.matchCentreUrl ? new URL(match.matchCentreUrl, base).href : `${base}/draw/`
    };
}

export function normalizeNrlLadder(data, teams) {
    return (data.positions || []).map((position, index) => {
        const stats = position.stats || {};
        const team = [...teams.values()].find(t => t.key === position.theme?.key);
        if (!team) throw new Error(`Unmatched NRL ladder team: ${position.teamNickname}`);
        return {
            rank: index + 1, team, played: number(stats.played), wins: number(stats.wins),
            losses: number(stats.lost), draws: number(stats.drawn), points: number(stats.points),
            for: number(stats['points for']), against: number(stats['points against']),
            difference: number(stats['points difference']), byes: number(stats.byes),
            percentage: null, winPct: null, gamesBehind: null
        };
    });
}

export async function fetchNrl({ sport = 'nrl', fetchJson, now = new Date(), previous }) {
    if (!['nrl', 'nrlw'].includes(sport)) throw new Error('Unknown NRL competition');
    const competition = sport === 'nrlw' ? 161 : 111;
    const label = sport.toUpperCase();
    const season = now.getUTCFullYear();
    const drawUrl = `${base}/draw/data?competition=${competition}&season=${season}`;
    const draw = await fetchJson(drawUrl);
    if (Number(draw.selectedSeasonId) !== season || Number(draw.selectedCompetitionId) !== competition || !draw.filterRounds?.length) {
        throw new Error(`The ${season} ${label} draw is not published yet; retaining the last available season`);
    }
    const teams = new Map((draw.filterTeams || []).map(t => [String(t.value), {
        id: String(t.value), key: t.theme?.key, name: t.name, abbreviation: t.name,
        logo: logo(t.theme), color: '#073d2e'
    }]));
    let ladder;
    let ladderError;
    try {
        ladder = await fetchJson(`${base}/ladder/data?competition=${competition}&season=${season}`);
        if (Number(ladder.selectedSeasonId) !== season || Number(ladder.selectedCompetitionId) !== competition || !ladder.positions?.length) throw new Error(`${label} ladder is not yet available`);
        // Club profile slugs and next-opponent records carry full club identities.
        for (const row of ladder.positions) {
            const team = [...teams.values()].find(t => t.key === row.theme?.key);
            if (team && row.clubProfileUrl) {
                const slug = row.clubProfileUrl.split('/').filter(Boolean).at(-1);
                if (slug) team.name = slug.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
            }
        }
        for (const row of ladder.positions) {
            const team = teams.get(String(row.next?.teamId));
            if (team && row.next.fullName) team.name = row.next.fullName;
        }
    } catch (error) { ladderError = error; ladder = null; }
    const rounds = [...draw.filterRounds].sort((a, b) => Number(a.value) - Number(b.value));
    const groups = [];
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < rounds.length) {
            const round = rounds[next++];
            const data = Number(draw.selectedRoundId) === Number(round.value) ? draw : await fetchJson(`${drawUrl}&round=${round.value}`);
            if (Number(data.selectedSeasonId) !== season || Number(data.selectedCompetitionId) !== competition || Number(data.selectedRoundId) !== Number(round.value) || !Array.isArray(data.fixtures)) throw new Error(`Invalid ${label} round ${round.value}`);
            const matches = data.fixtures.filter(m => m.type === 'Match').map(m => normalizeNrlMatch(m, teams, round.value)).filter(Boolean);
            if (!matches.length) throw new Error(`Empty ${label} round ${round.value}; retaining cached draw`);
            matches.sort((a, b) => Date.parse(a.startTime || '') - Date.parse(b.startTime || ''));
            groups.push({ id: String(round.value), label: round.name, startDate: matches.find(m => m.startTime)?.startTime || null, matches,
                byes: (data.byes || []).map(bye => bye.teamNickName).filter(Boolean) });
        }
    }));
    groups.sort((a, b) => Number(a.id) - Number(b.id));
    const sameSeason = previous?.sport === sport && previous?.season === season;
    const standings = ladder ? [{ id: 'overall', label: `${label} Ladder`, rows: normalizeNrlLadder(ladder, teams) }] : sameSeason ? previous.standings || [] : [];
    return {
        sport, season, seasonLabel: String(season), updatedAt: now.toISOString(), fixturesUpdatedAt: now.toISOString(),
        standingsUpdatedAt: ladder ? now.toISOString() : sameSeason ? previous.standingsUpdatedAt || previous.updatedAt : null,
        source: { name: 'NRL.com', url: `${base}/draw/?competition=${competition}&season=${season}` },
        sources: [{ name: `Official ${label} draw`, url: drawUrl }, { name: `Official ${label} ladder`, url: `${base}/ladder/data?competition=${competition}&season=${season}` }],
        groups, standings,
        ...(ladderError ? { notice: 'The ladder could not be refreshed. Any displayed standings are from the last successful update.' } : {})
    };
}
