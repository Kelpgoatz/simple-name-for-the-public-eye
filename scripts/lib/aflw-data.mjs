import { readFile } from 'node:fs/promises';

const base = 'https://aflapi.afl.com.au/afl/v2';
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const key = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const date = value => {
    const parsed = Date.parse(String(value || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export function selectAflwSeason(seasons, year) {
    return seasons.filter(season => Number(season.season?.year) === Number(year) && season.competition?.code === 'AFLW' && !/preseason|practice|all.?stars|origin|v\s*ireland|australia\s*v/i.test(`${season.name} ${season.shortName}`))
        .sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

export function normalizeAflwTeam(raw, identities = {}) {
    if (!raw?.id) throw new Error('AFLW team identity is missing');
    const identity = identities[key(raw.name)] || identities[key(raw.club?.name)];
    return {
        id: String(raw.id), name: raw.name || identity?.name || 'Team TBC', abbreviation: raw.abbreviation || '',
        logo: identity?.image || identity?.logo || '', color: identity?.color || '#073d2e'
    };
}

export function normalizeAflwMatch(raw, teams) {
    if (!raw.id || !raw.home?.team?.id || !raw.away?.team?.id) throw new Error('Invalid AFLW match');
    const state = String(raw.status || '').toUpperCase();
    const status = /POSTPONE|DELAY/.test(state) ? 'postponed' : /CANCEL|ABANDON/.test(state) ? 'cancelled' : /CONCLUDED|COMPLETE|FINAL/.test(state) ? 'final' : /LIVE|PLAYING|IN_PROGRESS|QUARTER|HALF_TIME/.test(state) ? 'live' : 'scheduled';
    const scored = ['live', 'final'].includes(status);
    const homeScore = scored ? number(raw.home.score?.totalScore) : null;
    const awayScore = scored ? number(raw.away.score?.totalScore) : null;
    const placeholder = state === 'PLACEHOLDER';
    return {
        id: String(raw.id), startTime: placeholder ? null : date(raw.utcStartTime), status,
        statusDetail: placeholder ? 'Date and time TBC' : status === 'final' ? 'Full time' : status === 'live' ? raw.period || 'Live' : status === 'scheduled' ? 'Scheduled' : status,
        venue: [raw.venue?.name, raw.venue?.location].filter(Boolean).join(' · '),
        home: teams.get(String(raw.home.team.id)) || normalizeAflwTeam(raw.home.team),
        away: teams.get(String(raw.away.team.id)) || normalizeAflwTeam(raw.away.team), homeScore, awayScore,
        winner: status !== 'final' || homeScore == null || awayScore == null || homeScore === awayScore ? null : homeScore > awayScore ? 'home' : 'away'
    };
}

export function normalizeAflwLadder(data, teams, seasonId) {
    if (Number(data.compSeason?.id) !== Number(seasonId)) throw new Error('AFLW ladder season mismatch');
    const entries = data.ladders?.[0]?.entries;
    if (!entries?.length) throw new Error('AFLW ladder is not available');
    return entries.map(entry => {
        const team = teams.get(String(entry.team?.id));
        if (!team) throw new Error('Unknown AFLW ladder team');
        const record = entry.thisSeasonRecord || {}, wins = record.winLossRecord || {};
        return {
            rank: number(entry.position), team, played: number(wins.played ?? entry.played), wins: number(wins.wins), losses: number(wins.losses), draws: number(wins.draws),
            points: number(record.aggregatePoints), percentage: number(record.percentage), for: number(entry.pointsFor), against: number(entry.pointsAgainst), winPct: null, gamesBehind: null
        };
    }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
}

export function aflwSeasonBounds(groups) {
    const starts = groups.map(group => group.startDate).filter(Boolean).sort();
    const ends = groups.map(group => group.endDate || group.startDate).filter(Boolean);
    const knownMatchEnds = groups.flatMap(group => group.matches).map(match => match.startTime && new Date(Date.parse(match.startTime) + 3 * 3600000).toISOString()).filter(Boolean);
    return { seasonStart: starts[0] || null, seasonEnd: [...ends, ...knownMatchEnds].sort().at(-1) || null };
}

async function paginated(fetchJson, url, field) {
    const all = [], seen = new Set();
    for (let page = 0; page < 100; page++) {
        const data = await fetchJson(`${url}${url.includes('?') ? '&' : '?'}page=${page}&pageSize=100`);
        if (!Array.isArray(data[field])) throw new Error(`AFLW ${field} response is invalid`);
        for (const item of data[field]) if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
        const pagination = data.meta?.pagination;
        if (pagination?.numPages != null && page + 1 >= Number(pagination.numPages)) {
            if (pagination.numEntries != null && all.length < Number(pagination.numEntries)) throw new Error(`Incomplete AFLW ${field} pagination`);
            return all;
        }
        if (!data[field].length || (!pagination && data[field].length < 100)) return all;
    }
    throw new Error(`AFLW ${field} pagination did not terminate`);
}

export async function fetchAflw({ fetchJson, now = new Date(), previous }) {
    const season = now.getUTCFullYear();
    const available = await paginated(fetchJson, `${base}/compseasons`, 'compSeasons');
    const competition = selectAflwSeason(available, season);
    if (!competition) throw new Error(`The ${season} AFLW season is not published yet; retaining the last available season`);
    const [matches, rounds] = await Promise.all([
        paginated(fetchJson, `${base}/matches?compSeasonId=${competition.id}`, 'matches'),
        paginated(fetchJson, `${base}/compseasons/${competition.id}/rounds`, 'rounds')
    ]);
    if (!matches.length || !rounds.length || matches.some(match => Number(match.compSeason?.id) !== Number(competition.id))) throw new Error('AFLW draw is incomplete or has a mismatched season');
    const identities = {};
    try { Object.assign(identities, JSON.parse(await readFile(new URL('../../sport-identities.json', import.meta.url), 'utf8')).afl || {}); } catch {}
    // AFLW and AFL sides use the same club crests. Prefer the reviewed local manifest.
    try {
        const logos = await fetchJson('https://site.api.espn.com/apis/site/v2/sports/australian-football/afl/teams?limit=100');
        for (const { team } of logos.sports?.[0]?.leagues?.[0]?.teams || []) {
            const id = key(team.displayName);
            if (!identities[id]) identities[id] = { name: team.displayName, image: team.logos?.[0]?.href || '', color: /^[0-9a-f]{6}$/i.test(team.color || '') ? `#${team.color}` : '#073d2e' };
        }
    } catch {}
    const teams = new Map();
    for (const match of matches) for (const side of ['home', 'away']) {
        const raw = match[side]?.team;
        if (raw?.id) teams.set(String(raw.id), normalizeAflwTeam(raw, identities));
    }
    let ladder, ladderError;
    try {
        ladder = await fetchJson(`${base}/compseasons/${competition.id}/ladders`);
        if (Number(ladder.compSeason?.id) !== Number(competition.id)) throw new Error('AFLW ladder season mismatch');
        for (const entry of ladder.ladders?.[0]?.entries || []) teams.set(String(entry.team.id), normalizeAflwTeam(entry.team, identities));
        ladder = normalizeAflwLadder(ladder, teams, competition.id);
    } catch (error) { ladderError = error; ladder = null; }
    const groups = rounds.sort((a, b) => Number(a.roundNumber) - Number(b.roundNumber)).map(round => {
        const games = matches.filter(match => Number(match.round?.id) === Number(round.id)).map(match => normalizeAflwMatch(match, teams));
        games.sort((a, b) => Date.parse(a.startTime || round.utcStartTime || '') - Date.parse(b.startTime || round.utcStartTime || ''));
        return { id: String(round.roundNumber), label: round.name || `Round ${round.roundNumber}`, startDate: date(round.utcStartTime), endDate: date(round.utcEndTime), matches: games };
    });
    if (groups.reduce((total, group) => total + group.matches.length, 0) !== matches.length) throw new Error('AFLW matches are missing round metadata');
    const sameSeason = previous?.sport === 'aflw' && Number(previous.season) === season;
    return {
        sport: 'aflw', season, seasonId: competition.id, seasonLabel: String(season), updatedAt: now.toISOString(), fixturesUpdatedAt: now.toISOString(),
        ...aflwSeasonBounds(groups),
        standingsUpdatedAt: ladder ? now.toISOString() : sameSeason ? previous.standingsUpdatedAt || previous.updatedAt : null,
        source: { name: 'AFL.com.au', url: 'https://www.afl.com.au/aflw/fixture' },
        sources: [{ name: 'Official AFLW fixtures', url: `${base}/matches?compSeasonId=${competition.id}` }, { name: 'Official AFLW ladder', url: `${base}/compseasons/${competition.id}/ladders` }],
        groups, standings: ladder ? [{ id: 'overall', label: 'AFLW Ladder', rows: ladder }] : sameSeason ? previous.standings || [] : [],
        ...(ladderError ? { notice: 'The AFLW ladder could not be refreshed. Any displayed standings are from the last successful update for this season.' } : {})
    };
}
