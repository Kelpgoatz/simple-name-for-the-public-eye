import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { fetchNrl } from './lib/nrl-data.mjs';
import { fetchEspnSport } from './lib/espn-sports.mjs';
import { fetchTennis } from './lib/tennis-data.mjs';
import { fetchAflw } from './lib/aflw-data.mjs';

export async function fetchJson(url) {
    let failure;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'cgrillo-sports/1.0' }, signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
            return await response.json();
        } catch (error) {
            failure = error;
            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }
    throw failure;
}

export function validateSportData(data, sport) {
    if (data?.sport !== sport || !data.season || !data.seasonLabel || !Array.isArray(data.groups) || !data.groups.length || !Array.isArray(data.standings)) throw new Error(`Invalid ${sport} snapshot`);
    const ids = new Set();
    for (const group of data.groups) {
        if (!group.id || !group.label || !Array.isArray(group.matches)) throw new Error(`Invalid ${sport} fixture group`);
        for (const match of group.matches) {
            if (!match.id || !match.home?.name || !match.away?.name || !['scheduled', 'live', 'final', 'postponed', 'cancelled'].includes(match.status)) throw new Error(`Invalid ${sport} match`);
            const id = `${match.tour || sport}:${match.id}`;
            if (ids.has(id)) throw new Error(`Duplicate ${sport} match ${id}`);
            ids.add(id);
        }
    }
    if (!ids.size && sport !== 'tennis') throw new Error(`Empty ${sport} calendar`);
    return data;
}

export async function updateSports(selected = ['nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'aflw', 'tennis'], now = new Date()) {
    const directory = new URL('../sports-data/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const results = await Promise.allSettled(selected.map(async sport => {
        if (!['nrl', 'nrlw', 'nba', 'wnba', 'nbl', 'nfl', 'aflw', 'tennis'].includes(sport)) throw new Error(`Unknown sport: ${sport}`);
        const output = new URL(`${sport}.json`, directory);
        let previous;
        try { previous = JSON.parse(await readFile(output, 'utf8')); } catch {}
        const context = { sport, fetchJson, now, previous };
        const data = validateSportData(await (['nrl', 'nrlw'].includes(sport) ? fetchNrl(context) : sport === 'aflw' ? fetchAflw(context) : sport === 'tennis' ? fetchTennis(context) : fetchEspnSport(sport, context)), sport);
        const temporary = new URL(`${sport}.json.tmp`, directory);
        await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
        await rename(temporary, output);
        console.log(`${sport.toUpperCase()}: ${data.seasonLabel}, ${data.groups.length} groups, ${data.groups.reduce((n, g) => n + g.matches.length, 0)} matches, ${data.standings.reduce((n, g) => n + g.rows.length, 0)} ladder entries`);
    }));
    results.forEach((result, index) => {
        if (result.status === 'rejected') console.error(`${selected[index].toUpperCase()}: ${result.reason.message}. Existing data retained.`);
    });
    return results.every(result => result.status === 'fulfilled');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!await updateSports(process.argv.slice(2).length ? process.argv.slice(2) : undefined)) process.exitCode = 1;
}
