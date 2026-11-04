import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { normalize, flagCode } from './lib/identity-utils.mjs';

async function jsonFile(name, fallback = {}) {
    try { return JSON.parse(await readFile(new URL(`../${name}`, import.meta.url), 'utf8')); } catch { return fallback; }
}
async function request(url, json = true) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    return json ? response.json() : response.text();
}
export async function updateIdentities() {
    const previous = await jsonFile('sport-identities.json');
    const data = { ...previous, afl: { ...previous.afl }, drivers: { ...previous.drivers }, constructors: { ...previous.constructors }, sources: {
        afl: 'https://site.api.espn.com/apis/site/v2/sports/australian-football/afl/teams?limit=100',
        drivers: 'drivers-championship.json', constructors: 'https://www.formula1.com/en/teams', flags: 'https://flagcdn.com/'
    } };
    const failures = [];
    const standings = await jsonFile('drivers-championship.json');
    const fixtures = await jsonFile('f1-fixtures.json');
    const sessions = await jsonFile('f1-sessions.json');
    const driverIds = new Set();
    const driverNames = new Map();
    const collect = value => {
        if (!value || typeof value !== 'object') return;
        if (value.driverId) driverIds.add(value.driverId);
        if (value.driverId && value.driver?.name && value.driver?.surname) driverNames.set(value.driverId, `${value.driver.name} ${value.driver.surname}`);
        Object.values(value).forEach(collect);
    };
    [standings, fixtures, sessions].forEach(collect);
    const reserves = (await jsonFile('driver-nationalities.json')).drivers || {};
    for (const [id, name] of driverNames) {
        const reserve = reserves[name];
        const code = flagCode(reserve?.nationality);
        if (code) data.drivers[id] ||= { ...reserve, image: `https://flagcdn.com/w40/${code}.png` };
    }
    for (const standing of standings.drivers_championship || []) {
        const code = flagCode(standing.driver?.nationality);
        if (code) data.drivers[standing.driverId] = { nationality: standing.driver.nationality, image: `https://flagcdn.com/w40/${code}.png` };
    }
    await Promise.all([
        (async () => {
            try {
                const season = fixtures.season || standings.season;
                const url = `https://www.formula1.com/en/results/${season}/drivers`;
                const html = await request(url, false);
                let matched = 0;
                for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
                    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match => match[1]);
                    const slug = cells[1]?.match(/\/drivers\/[^/"<>]+\/([^/"<>]+)/)?.[1];
                    const nationality = cells[2]?.replace(/<[^>]*>/g, '').trim();
                    const code = flagCode(nationality);
                    if (!slug || !code) continue;
                    for (const id of driverIds) {
                        if (!normalize(slug).endsWith(normalize(id))) continue;
                        data.drivers[id] ||= { nationality, image: `https://flagcdn.com/w40/${code}.png` };
                        matched++;
                    }
                }
                if (!matched) throw new Error('Official driver nationalities unavailable');
                data.sources.driverResults = url;
            } catch (error) { failures.push(error.message); }
        })(),
        (async () => {
            try {
                const response = await request(data.sources.afl);
                const teams = response.sports?.[0]?.leagues?.find(league => league.slug === 'afl')?.teams;
                if (!teams?.length) throw new Error('No AFL teams returned');
                for (const { team } of teams) {
                    let image = team.logos?.find(logo => logo.rel?.includes('default'))?.href || team.logos?.[0]?.href;
                    // ESPN currently assigns Gold Coast's old asset to Sydney.
                    // Apply this correction only while the known incorrect URL is present.
                    if (normalize(team.displayName) === 'sydneyswans' && image?.endsWith('/gcfc.png')) image = image.replace('/gcfc.png', '/syd.png');
                    if (image) data.afl[normalize(team.displayName)] = { name: team.displayName, image };
                }
                data.aflUpdatedAt = new Date().toISOString();
            } catch (error) { failures.push(error.message); }
        })(),
        (async () => {
            try {
                const html = await request(data.sources.constructors, false);
                const logos = [...new Set(html.match(/https:\/\/media\.formula1\.com\/image\/upload\/[^"<>\s\\]+\/common\/f1\/\d{4}\/[a-z0-9]+\/\d{4}[a-z0-9]+logowhite\.webp/g) || [])];
                if (!logos.length) throw new Error('No official F1 team logos found');
                const constructors = await jsonFile('constructors-championship.json');
                const teams = [...(constructors.constructors_championship || []), ...(standings.drivers_championship || [])];
                const aliases = { red_bull: 'redbullracing', rb: 'racingbulls', haas: 'haasf1team' };
                for (const team of teams) {
                    const names = [aliases[team.teamId], normalize(team.teamId), normalize(team.team?.teamName)].filter(Boolean);
                    const image = logos.find(url => names.includes(url.split('/').at(-2)));
                    if (image) data.constructors[team.teamId] = { name: team.team?.teamName || team.teamId, image };
                }
                data.constructorsUpdatedAt = new Date().toISOString();
            } catch (error) { failures.push(error.message); }
        })()
    ]);
    // Practice-only rookies may have no F1 championship row yet. Their official
    // junior-series profiles publish nationality flags alongside the full name.
    const missing = [...driverIds].filter(id => !data.drivers[id] && driverNames.has(id));
    let next = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
        while (next < missing.length) {
            const id = missing[next++];
            const slug = driverNames.get(id).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const url = `https://www.fiaformula2.com/en/drivers/${slug}`;
            try {
                const html = await request(url, false);
                const nationality = html.match(/<title>Flag of ([^<]+)<\/title>/)?.[1];
                const code = flagCode(nationality);
                if (code) data.drivers[id] = { nationality, image: `https://flagcdn.com/w40/${code}.png`, source: url };
            } catch { /* Retain the number if this driver's profile is not published. */ }
        }
    }));
    if (!Object.keys(data.afl).length || !Object.keys(data.constructors).length || !Object.keys(data.drivers).length) throw new Error('Incomplete identity sources; retaining existing manifest');
    await writeFile(new URL('../sport-identities.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
    console.log(`Identities: ${Object.keys(data.afl).length} AFL logos, ${Object.keys(data.constructors).length} F1 logos, ${Object.keys(data.drivers).length} driver flags`);
    if (failures.length) throw new Error(`Cached assets retained: ${failures.join('; ')}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await updateIdentities();
