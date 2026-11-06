import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createJolpicaClient } from './lib/jolpica-client.mjs';
import { createF1Identities, normalizeCalendar, normalizeResults } from './lib/f1-source.mjs';

const output = new URL("../f1-fixtures.json", import.meta.url);
const season = Number(process.argv[2] || new Date().getUTCFullYear());
if (!Number.isInteger(season) || season < 1950) throw new Error("Invalid F1 season");

let previous;
try { previous = JSON.parse(await readFile(output, "utf8")); } catch {}
const saved = async file => { try { return JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8')); } catch { return null; } };
const identities = createF1Identities({ fixtures: previous, drivers: await saved('drivers-championship.json'), constructors: await saved('constructors-championship.json') });
const request = createJolpicaClient();
const calendar = normalizeCalendar(await request(`${season}/?limit=100`), season, previous);
if (!Array.isArray(calendar.races) || !calendar.races.length) throw new Error("Empty race calendar; retaining existing fixtures");

const races = [];
for (const race of calendar.races) {
    const circuit = Array.isArray(race.circuit) ? race.circuit[0] : race.circuit;
    const schedule = race.schedule?.race;
    if (!race.raceName || !Number.isInteger(Number(race.round)) || !circuit?.circuitId) {
        throw new Error("Invalid race calendar; retaining existing fixtures");
    }
    const time = schedule?.time;
    const startTime = schedule?.date && time ? `${schedule.date}T${time.replace(/Z$/, "")}Z` : null;
    races.push({
        round: Number(race.round), raceId: race.raceId, name: race.raceName,
        circuitId: circuit.circuitId, circuit: circuit.circuitName,
        location: [circuit.city, circuit.country].filter(Boolean).join(", "),
        date: schedule?.date || null, startTime, laps: race.laps,
        sessionSchedule: race.schedule,
        // The API expresses circuit lengths in metres with a "km" suffix.
        lengthKm: Number.parseFloat(circuit.circuitLength) > 100
            ? Number.parseFloat(circuit.circuitLength) / 1000
            : Number.parseFloat(circuit.circuitLength) || null,
        corners: circuit.corners,
        status: race.winner?.driverId ? "CONCLUDED" : "SCHEDULED",
        fastestLap: race.fast_lap?.fast_lap && race.fast_lap?.fast_lap_driver_id ? {
            driverId: race.fast_lap.fast_lap_driver_id,
            teamId: race.fast_lap.fast_lap_team_id,
            time: race.fast_lap.fast_lap
        } : null,
        results: [],
        resultsSource: `https://api.jolpi.ca/ergast/f1/${season}/${race.round}/results/?limit=100`
    });
}

// Limit concurrent requests; fetch full classifications, never the three-place podium.
let next = 0;
let failures = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < races.length) {
        const race = races[next++];
        const raceTime = Date.parse(race.startTime || race.date);
        if (race.status !== "CONCLUDED" && (!Number.isFinite(raceTime) || raceTime > Date.now())) continue;
        try {
            const results = normalizeResults(await request(`${season}/${race.round}/results/?limit=100`), season, race.round, identities);
            race.results = results.map(result => {
                const cachedRace = Number(previous?.season) === season && previous.races?.find(item => item.raceId === race.raceId);
                const cached = cachedRace?.results?.find(item => item.driverId === result.driverId);
                const missingGrid = result.grid == null || /^(?:not available|n\/a|unknown|[-–]|0)?$/i.test(String(result.grid).trim());
                const useCachedGrid = missingGrid && cached?.gridSource;
                return {
                    position: result.position, grid: useCachedGrid ? cached.grid : result.grid ?? null,
                    ...(useCachedGrid ? { gridSource: cached.gridSource } : {}), driverId: result.driverId,
                    driver: { name: result.driver.name, surname: result.driver.surname, number: result.driver.number },
                    teamId: result.team.teamId, points: result.points,
                    time: result.time, retired: result.retired, fastLap: result.fastLap, lapsCompleted: result.lapsCompleted, fastestLapRank: result.fastestLapRank
                };
            });
            const timed = race.results.filter(row => /^\d+:\d{2}\.\d{3}$/.test(row.fastLap || '')).sort((a, b) => {
                const seconds = value => Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
                return seconds(a.fastLap) - seconds(b.fastLap);
            });
            const fastest = timed.find(row => row.fastestLapRank === 1) || timed[0];
            race.fastestLap = fastest ? { driverId: fastest.driverId, teamId: fastest.teamId, time: fastest.fastLap } : null;
            race.laps = results.find(row => Number(row.position) === 1)?.lapsCompleted || race.laps;
            race.status = "CONCLUDED";
        } catch (error) {
            const cached = previous?.season === season && previous.races?.find(item => item.raceId === race.raceId);
            if (cached?.results?.length) {
                race.results = cached.results;
                race.status = "CONCLUDED";
                race.fastestLap ||= cached.fastestLap;
                race.resultsSource = cached.resultsSource;
            }
            failures++;
            console.warn(`Round ${race.round}: ${error.message}${race.results.length ? "; retained cached results" : ""}`);
        }
    }
}));

races.sort((a, b) => a.round - b.round);
if (new Set(races.map(race => race.round)).size !== races.length) throw new Error("Duplicate rounds");
const snapshot = { season, source: calendar.url, races };
// Avoid a scheduled commit when only the retrieval time changed.
if (JSON.stringify(snapshot) !== JSON.stringify({ season: previous?.season, source: previous?.source, races: previous?.races })) {
    await writeFile(output, JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }, null, 2) + "\n");
}
console.log(`${fileURLToPath(output)}: ${races.length} races, ${races.filter(race => race.results.length).length} classifications, ${failures} pending/failed requests`);
