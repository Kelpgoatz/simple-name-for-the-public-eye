import { readFile, writeFile, rename } from 'node:fs/promises';
import { normalizePlayerStats, roundLeaders } from './lib/afl-player-stats.mjs';

const base = 'https://aflapi.afl.com.au/afl/v2';
const api = 'https://api.afl.com.au';
const now = new Date(), year = now.getUTCFullYear();
const output = new URL('../afl-player-stats.json', import.meta.url);
const cacheFile = new URL('../sports-data/afl-player-matches.json', import.meta.url);
async function request(url, options = {}) {
    let failure;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, { ...options, signal: AbortSignal.timeout(25000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url).pathname}`);
            return await response.json();
        } catch (error) { failure = error; }
    }
    throw failure;
}
async function pages(url, field) {
    const rows = [], ids = new Set();
    for (let page = 0; page < 100; page++) {
        const data = await request(`${url}${url.includes('?') ? '&' : '?'}page=${page}&pageSize=100`);
        if (!Array.isArray(data[field])) throw new Error(`Missing ${field} from AFL feed`);
        for (const row of data[field]) if (!ids.has(row.id)) { rows.push(row); ids.add(row.id); }
        if (data.meta?.pagination?.numPages != null && page + 1 >= data.meta.pagination.numPages) {
            if (rows.length < data.meta.pagination.numEntries) throw new Error(`Incomplete ${field} pagination`);
            return rows;
        }
        if (data[field].length < 100) return rows;
    }
    throw new Error('AFL pagination did not terminate');
}
const seasons = await pages(`${base}/compseasons`, 'compSeasons');
const season = seasons.find(item => item.season?.year === year && item.competition?.code === 'AFL' && item.shortName === 'Premiership');
if (!season) throw new Error(`${year} AFL season unavailable; retaining cached player statistics`);
const fixtures = await pages(`${base}/matches?compSeasonId=${season.id}`, 'matches');
if (!fixtures.length || fixtures.some(match => match.compSeason?.id !== season.id)) throw new Error('Invalid AFL fixture season');
let previous;
try { previous = JSON.parse(await readFile(cacheFile, 'utf8')); }
catch { try { previous = JSON.parse(await readFile(output, 'utf8')); } catch {} }
const matches = previous?.seasonId === season.id ? { ...previous.matches } : {};
const played = fixtures.filter(match => /CONCLUDED|LIVE|IN_PROGRESS|PLAYING/.test(match.status || ''));
const refreshAll = process.argv.includes('--refresh-all');
const pending = played.filter(match => {
    const cached = matches[match.id];
    return refreshAll || !cached || cached.status !== 'CONCLUDED' || Date.parse(cached.updatedAt) < now.getTime() - 7 * 86400000;
});
let token;
if (pending.length) {
    const auth = await request(`${api}/cfs/afl/WMCTok`, { method: 'POST' });
    if (!auth.token) throw new Error('Player statistics session unavailable; retaining cache');
    token = auth.token;
}
let next = 0;
const failures = new Set();
await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < pending.length) {
        const match = pending[next++];
        try {
            const payload = await request(`${api}/cfs/afl/playerStats/match/${match.providerId}`, { headers: { 'x-media-mis-token': token } });
            const players = normalizePlayerStats(payload, match);
            matches[match.id] = { id: match.id, providerId: match.providerId, round: match.round.roundNumber, status: match.status, updatedAt: now.toISOString(), players };
        } catch (error) {
            failures.add(match.id);
            console.error(`Match ${match.id}: ${error.message}; retained cached values if available`);
        }
    }
}));
const rounds = {};
for (const number of new Set(fixtures.map(match => match.round.roundNumber))) {
    const expected = fixtures.filter(match => match.round.roundNumber === number);
    const started = expected.filter(match => played.includes(match));
    const available = started.map(match => matches[match.id]).filter(Boolean);
    const missing = started.filter(match => !matches[match.id] || failures.has(match.id)).map(match => match.id);
    rounds[number] = { round: number, label: expected[0].round.name, scheduledMatches: expected.length, playedMatches: started.length, availableMatches: available.length,
        complete: missing.length === 0, pendingMatches: expected.length - started.length, missingMatches: missing,
        updatedAt: available.length ? available.map(match => match.updatedAt).sort()[0] : null, leaders: roundLeaders(available) };
}
const temporary = new URL('../afl-player-stats.json.tmp', import.meta.url);
const cacheTemporary = new URL('../sports-data/afl-player-matches.json.tmp', import.meta.url);
await writeFile(cacheTemporary, JSON.stringify({season: year, seasonId: season.id, matches}, null, 2) + '\n');
await rename(cacheTemporary, cacheFile);
await writeFile(temporary, JSON.stringify({ season: year, seasonId: season.id, updatedAt: now.toISOString(), source: `${api}/cfs/afl/playerStats/match/`, rounds }, null, 2) + '\n');
await rename(temporary, output);
console.log(`${year} AFL player stats: ${Object.keys(rounds).length} rounds, ${Object.keys(matches).length} matches; refreshed ${pending.length - failures.size}, failed ${failures.size}`);
if (failures.size) process.exitCode = 1;
