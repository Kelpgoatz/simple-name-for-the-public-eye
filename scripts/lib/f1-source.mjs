// Adapt the public Ergast-compatible source to the viewer's existing identities.
// Keep saved display names and circuit IDs so flags, logos, profiles and notes agree.
const canonical = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const circuits = { villeneuve: 'gilles_villeneuve', catalunya: 'montmelo', americas: 'austin', rodriguez: 'hermanos_rodriguez', bahrain: 'bahrein', losail: 'lusail', las_vegas: 'vegas' };
export const circuitId = id => circuits[id] || id;
export function createF1Identities({ fixtures, drivers, constructors } = {}) {
    const driverRows = new Map(), teamRows = new Map();
    for (const row of drivers?.drivers_championship || []) {
        driverRows.set(row.driverId, { driverId: row.driverId, driver: row.driver });
        if (row.teamId) teamRows.set(row.teamId, row.team);
    }
    for (const row of constructors?.constructors_championship || []) teamRows.set(row.teamId, row.team);
    for (const race of fixtures?.races || []) for (const row of race.results || []) {
        if (!driverRows.has(row.driverId)) driverRows.set(row.driverId, row);
    }
    return {
        driver(raw) {
            if (!raw?.driverId || !raw.givenName || !raw.familyName) throw new Error('Invalid Jolpica driver identity');
            const known = driverRows.get(raw.driverId) || [...driverRows.values()].find(row => canonical(`${row.driver?.name} ${row.driver?.surname}`) === canonical(`${raw.givenName} ${raw.familyName}`));
            return { driverId: known?.driverId || raw.driverId, driver: {
                ...known?.driver, name: known?.driver?.name || raw.givenName, surname: known?.driver?.surname || raw.familyName,
                nationality: raw.nationality, birthday: raw.dateOfBirth, number: Number(raw.permanentNumber) || known?.driver?.number || null,
                shortName: raw.code || known?.driver?.shortName, url: raw.url
            } };
        },
        team(raw) {
            if (!raw?.constructorId || !raw.name) throw new Error('Invalid Jolpica constructor identity');
            return { teamId: raw.constructorId, team: { ...teamRows.get(raw.constructorId), teamId: raw.constructorId,
                teamName: teamRows.get(raw.constructorId)?.teamName || raw.name, country: raw.nationality, url: raw.url } };
        }
    };
}
function raceTable(payload, season, round) {
    const table = payload?.MRData?.RaceTable;
    if (Number(table?.season) !== season || !Array.isArray(table.Races) || round != null && Number(table.round) !== round) throw new Error('Jolpica race season/round mismatch');
    if (table.Races.some(row => Number(row.season) !== season || round != null && Number(row.round) !== round)) throw new Error('Jolpica race identity mismatch');
    return table.Races;
}
export function normalizeCalendar(payload, season, previous) {
    const rows = raceTable(payload, season);
    if (!rows.length || Number(payload.MRData.total) !== rows.length) throw new Error('Empty or incomplete race calendar; retaining saved fixtures');
    const races = rows.map(row => {
        if (!Number.isInteger(Number(row.round)) || Number(row.round) < 1 || !row.Circuit?.circuitId || !row.raceName || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error('Invalid Jolpica calendar row');
        const id = circuitId(row.Circuit.circuitId);
        const sameSeason = Number(previous?.season) === season;
        const candidates = previous?.races?.filter(race => race.circuitId === id) || [];
        const known = (sameSeason && candidates.find(race => Number(race.round) === Number(row.round))) || (candidates.length === 1 ? candidates[0] : null);
        const schedule = { race: { date: row.date, time: row.time || null } };
        for (const [target, field] of Object.entries({ fp1: 'FirstPractice', fp2: 'SecondPractice', fp3: 'ThirdPractice', qualy: 'Qualifying', sprintRace: 'Sprint', sprintQualy: 'SprintQualifying' })) {
            if (row[field]) schedule[target] = { date: row[field].date || null, time: row[field].time || null };
        }
        return { round: Number(row.round), raceId: sameSeason && known?.raceId || `${row.raceName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${season}`,
            raceName: sameSeason && known?.name || `Formula 1 ${row.raceName}`, schedule, laps: sameSeason && known?.laps || null,
            circuit: { circuitId: id, circuitName: known?.circuit || row.Circuit.circuitName, city: row.Circuit.Location?.locality,
                country: row.Circuit.Location?.country, circuitLength: known?.lengthKm || null, corners: known?.corners || null } };
    });
    if (new Set(races.map(row => row.round)).size !== races.length) throw new Error('Duplicate calendar rounds');
    if (new Set(races.map(row => row.raceId)).size !== races.length) throw new Error('Duplicate weekend identities');
    return { url: payload.MRData.url, races };
}
export function normalizeStandings(payload, season, kind, identities) {
    const table = payload?.MRData?.StandingsTable, lists = table?.StandingsLists;
    if (Number(table?.season) !== season || !Array.isArray(lists) || lists.some(list => Number(list.season) !== season)) throw new Error('Jolpica standings season mismatch');
    const field = kind === 'drivers' ? 'DriverStandings' : 'ConstructorStandings';
    const rows = lists.flatMap(list => list[field] || []);
    if (!rows.length || Number(payload.MRData.total) !== rows.length) throw new Error('Empty or incomplete championship standings; retaining saved standings');
    const standings = rows.map(row => {
        if (row.points == null || !Number.isFinite(Number(row.points)) || !Number.isInteger(Number(row.position)) || Number(row.position) < 1) throw new Error('Invalid championship classification');
        const identity = kind === 'drivers' ? { ...identities.driver(row.Driver), ...identities.team(row.Constructors?.at(-1)) } : identities.team(row.Constructor);
        return { ...identity, points: Number(row.points), position: Number(row.position), wins: Number(row.wins) || 0 };
    });
    return { api: 'Jolpica F1', url: payload.MRData.url, season, championshipId: `f1_${season}`, total: standings.length, [`${kind}_championship`]: standings };
}
export function normalizeResults(payload, season, round, identities, field = 'Results') {
    const race = raceTable(payload, season, round)[0];
    const rows = race?.[field];
    if (!rows?.length) throw new Error('Results not published yet');
    if (Number(payload.MRData.total) !== rows.length) throw new Error('Incomplete race classification');
    const winnerLaps = Number(rows.find(row => Number(row.position) === 1)?.laps);
    return rows.map(row => {
        if (!Number.isInteger(Number(row.position)) || Number(row.position) < 1 || row.points == null || !Number.isFinite(Number(row.points))) throw new Error('Invalid race classification');
        const identity = { ...identities.driver(row.Driver), ...identities.team(row.Constructor) };
        identity.driver.number = Number(row.number) || identity.driver.number;
        const completed = Number(row.laps), classified = /^\d+$/.test(String(row.positionText));
        const lapped = classified && Number.isInteger(completed) && winnerLaps > completed;
        const time = lapped ? `+${winnerLaps - completed} lap${winnerLaps - completed === 1 ? '' : 's'}` : row.Time?.time || null;
        return { ...identity, position: row.position, grid: Number(row.grid) > 0 ? row.grid : null,
            points: Number(row.points), time, retired: classified ? null : row.status || row.positionText || null,
            fastLap: row.FastestLap?.Time?.time || null, lapsCompleted: Number.isInteger(completed) ? completed : null,
            fastestLapRank: Number(row.FastestLap?.rank) > 0 ? Number(row.FastestLap.rank) : null,
            ...(row.FastestLap?.lap ? { fastestLapNumber: Number(row.FastestLap.lap) } : {}) };
    });
}
export function normalizeQualifying(payload, season, round, identities) {
    const rows = raceTable(payload, season, round)[0]?.QualifyingResults;
    if (!rows?.length) throw new Error('Qualifying results not published yet');
    if (Number(payload.MRData.total) !== rows.length) throw new Error('Incomplete qualifying classification');
    return rows.map(row => {
        if (!Number.isInteger(Number(row.position)) || Number(row.position) < 1) throw new Error('Invalid qualifying classification');
        const times = [row.Q1, row.Q2, row.Q3].map(value => /^\d+:\d{2}\.\d{3}$/.test(value || '') ? value : null);
        const segment = times[2] ? 3 : times[1] ? 2 : times[0] ? 1 : null;
        const identity = { ...identities.driver(row.Driver), ...identities.team(row.Constructor) };
        identity.driver.number = Number(row.number) || identity.driver.number;
        return { ...identity, position: row.position,
            q1: times[0], q2: times[1], q3: times[2], bestLap: segment ? times[segment - 1] : null,
            timingSegment: segment ? `Q${segment}` : null, lapsCompleted: null };
    });
}
