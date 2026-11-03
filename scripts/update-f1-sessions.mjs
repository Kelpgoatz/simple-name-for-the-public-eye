import { readFile, writeFile } from "node:fs/promises";

const fixtures = JSON.parse(await readFile(new URL("../f1-fixtures.json", import.meta.url), "utf8"));
const season = Number(fixtures.season);
const schemaVersion = 2;
const output = new URL("../f1-sessions.json", import.meta.url);
let previous;
try { previous = JSON.parse(await readFile(output, "utf8")); } catch {}
if (Number(previous?.season) !== season || previous?.schemaVersion !== schemaVersion) previous = null;

async function fetchData(url, json = true) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return json ? response.json() : response.text();
}
const clean = value => String(value ?? "").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&rsquo;|&apos;|&#39;/g, "’").replace(/\s+/g, " ").trim();
const normalize = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const validLap = value => /^\d{1,2}:\d{2}\.\d{3}$/.test(String(value || "")) ? value : null;
const lapMillis = value => {
    const lap = validLap(value);
    if (!lap) return null;
    const [minutes, seconds] = lap.split(":");
    return Math.round((Number(minutes) * 60 + Number(seconds)) * 1000);
};
const formatLap = value => `${Math.floor(value / 60000)}:${String(Math.floor(value / 1000) % 60).padStart(2, "0")}.${String(value % 1000).padStart(3, "0")}`;
const lapCount = value => /^\d+$/.test(String(value ?? "")) ? Number(value) : null;
const definitions = {
    fp1: { label: "P1", schedule: "fp1", endpoint: "fp1", field: "fp1Results", official: "practice/1" },
    fp2: { label: "P2", schedule: "fp2", endpoint: "fp2", field: "fp2Results", official: "practice/2" },
    fp3: { label: "P3", schedule: "fp3", endpoint: "fp3", field: "fp3Results", official: "practice/3" },
    sq: { label: "SQ", schedule: "sprintQualy", endpoint: "sprint/qualy", field: "sprintQualyResults", official: "sprint-qualifying" },
    sprint: { label: "Sprint", schedule: "sprintRace", endpoint: "sprint/race", field: "sprintRaceResults", official: "sprint-results" },
    qualifying: { label: "Q", schedule: "qualy", endpoint: "qualy", field: "qualyResults", official: "qualifying" }
};
const slugs = {
    albert_park: "australia", shanghai: "china", suzuka: "japan", miami: "miami",
    gilles_villeneuve: "canada", monaco: "monaco", montmelo: "barcelona-catalunya",
    red_bull_ring: "austria", silverstone: "great-britain", spa: "belgium",
    hungaroring: "hungary", zandvoort: "netherlands", monza: "italy", madring: "spain",
    baku: "azerbaijan", sepang: "bahrain", bahrein: "bahrain", marina_bay: "singapore",
    austin: "united-states", hermanos_rodriguez: "mexico", interlagos: "brazil",
    vegas: "las-vegas", lusail: "qatar", yas_marina: "abu-dhabi", jeddah: "saudi-arabia"
};
const teams = {
    mercedes: /mercedes/i, ferrari: /ferrari/i, red_bull: /red bull racing/i,
    rb: /racing bulls/i, mclaren: /mclaren/i, alpine: /alpine/i, haas: /haas/i,
    audi: /audi/i, williams: /williams/i, aston_martin: /aston martin/i, cadillac: /cadillac/i
};
const identityByNumber = new Map();
for (const race of fixtures.races) {
    for (const result of race.results || []) identityByNumber.set(String(result.driver.number), result);
}
function identityFromRow(cells, apiByNumber) {
    const known = apiByNumber.get(cells[1]) || identityByNumber.get(cells[1]);
    if (known) return { driverId: known.driverId, driver: known.driver, teamId: known.teamId };
    const name = clean(cells[2]).replace(/\s+[A-Z]{3}$/, "");
    const words = name.split(" ");
    const teamId = Object.entries(teams).find(([, pattern]) => pattern.test(cells[3]))?.[0];
    if (!name || !teamId) throw new Error(`Unmatched session identity: ${cells[2]} / ${cells[3]}`);
    return {
        driverId: normalize(name).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        driver: { name: words.slice(0, -1).join(" "), surname: words.at(-1), number: Number(cells[1]) }, teamId
    };
}
function parseRows(html) {
    return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
        .map(row => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => clean(cell[1])))
        .filter(cells => cells.length >= 6 && /^\d+$/.test(cells[1]));
}
function timingFields(row, key) {
    const prefix = key === "sq" ? "SQ" : "Q";
    const q1 = validLap(row.q1 || row.sq1), q2 = validLap(row.q2 || row.sq2), q3 = validLap(row.q3 || row.sq3);
    return { q1, q2, q3, timingSegment: q3 ? `${prefix}3` : q2 ? `${prefix}2` : q1 ? `${prefix}1` : null, bestLap: q3 || q2 || q1 };
}
function normalizeAPI(raw, key) {
    const rows = raw.map(result => {
        const driver = result.driver;
        if (!driver?.driverId || !result.team?.teamId) throw new Error("Invalid API session identity");
        return {
            position: result.position ?? result.gridPosition ?? null,
            driverId: result.driverId || driver.driverId,
            driver: { name: driver.name, surname: driver.surname, number: driver.number },
            teamId: result.teamId || result.team.teamId,
            bestLap: key === "qualifying" || key === "sq" ? null : validLap(result.time),
            lapsCompleted: lapCount(result.laps),
            ...(key === "qualifying" || key === "sq" ? timingFields(result, key) : {}),
            ...(key === "sprint" ? { grid: result.gridPosition ?? null, points: result.points ?? null, time: result.time ?? null, retired: result.retired ?? null, fastLap: validLap(result.fastLap) } : {})
        };
    });
    if (key.startsWith("fp")) {
        rows.sort((a, b) => (lapMillis(a.bestLap) ?? Infinity) - (lapMillis(b.bestLap) ?? Infinity));
        rows.forEach((row, index) => { row.position = index + 1; });
    } else rows.sort((a, b) => (Number(a.position) || Infinity) - (Number(b.position) || Infinity));
    return rows;
}
function mergeOfficial(html, key, apiRows) {
    const rows = parseRows(html);
    if (!rows.length) throw new Error("Official session table is empty");
    const byNumber = new Map(apiRows.map(row => [String(row.driver.number), row]));
    const leaderTime = key.startsWith("fp") ? lapMillis(rows[0][4]) : null;
    const merged = rows.map(cells => {
        const known = byNumber.get(cells[1]);
        const row = {
            ...known, ...identityFromRow(cells, byNumber), position: cells[0],
            lapsCompleted: lapCount(cells.at(-1))
        };
        if (key.startsWith("fp")) {
            const gap = cells[4].match(/^\+(\d+(?:\.\d+)?)s?$/);
            row.bestLap = validLap(cells[4]) || (gap && leaderTime !== null ? formatLap(leaderTime + Math.round(Number(gap[1]) * 1000)) : null);
            row.timingSegment = "Practice";
        } else if (key === "qualifying" || key === "sq") {
            if (cells.length < 8) throw new Error("Qualifying table does not contain all phases and laps");
            Object.assign(row, timingFields({ q1: cells[4], q2: cells[5], q3: cells[6] }, key));
        } else {
            row.lapsCompleted = lapCount(cells[4]);
            row.time = cells[5] || null;
            row.points = cells[6] === "" ? null : Number(cells[6]);
            row.fastLap = known?.fastLap || null;
            row.bestLap = row.fastLap;
        }
        return row;
    });
    // Official timing tables sometimes omit untimed participants entirely.
    // Keep the API's extra participants without inventing laps or lap times.
    const officialNumbers = new Set(rows.map(cells => cells[1]));
    return [...merged, ...apiRows.filter(row => !officialNumbers.has(String(row.driver.number)))];
}

const calendar = await fetchData(`https://f1api.dev/api/${season}?limit=100`);
if (!Array.isArray(calendar.races) || !calendar.races.length) throw new Error("Calendar unavailable; retaining previous sessions");
let officialPaths = [];
try {
    const index = await fetchData(`https://www.formula1.com/en/results/${season}/races`, false);
    officialPaths = [...new Set(index.match(new RegExp(`/en/results/${season}/races/\\d+/[^"<>\\\\ ]+/race-result`, "g")))];
} catch (error) { console.warn(`Official F1 index unavailable: ${error.message}`); }

const races = {}, jobs = [];
const today = new Date().toISOString().slice(0, 10);
for (const fixture of fixtures.races) {
    const race = calendar.races.find(race => race.raceId === fixture.raceId);
    if (!race || Number(race.round) !== Number(fixture.round)) throw new Error(`Calendar identity mismatch for ${fixture.raceId}`);
    const isSprint = Boolean(race.schedule?.sprintRace?.date || race.schedule?.sprintQualy?.date);
    const sessions = {};
    races[fixture.raceId] = { isSprint, sessions };
    const keys = isSprint ? ["fp1", "sq", "sprint", "qualifying"] : ["fp1", "fp2", "fp3", "qualifying"];
    for (const key of keys) {
        const definition = definitions[key];
        const schedule = race.schedule?.[definition.schedule];
        const date = schedule?.date || null;
        const startTime = date && schedule?.time ? `${date}T${schedule.time.replace(/Z$/, "")}Z` : null;
        const source = `https://f1api.dev/api/${season}/${fixture.round}/${definition.endpoint}?limit=100`;
        const session = { label: definition.label, date, startTime, source, status: "SCHEDULED", results: [] };
        sessions[key] = session;
        const start = Date.parse(startTime || date);
        if (!Number.isFinite(start) || start > Date.now()) continue;
        session.status = "PENDING";
        const cached = previous?.races?.[fixture.raceId]?.sessions?.[key];
        if (cached?.results?.length && cached.checkedDate === today && start < Date.now() - 2 * 86400000) {
            sessions[key] = { ...cached, date, startTime };
            continue;
        }
        const slug = slugs[fixture.circuitId];
        const official = slug && officialPaths.find(path => path.endsWith(`/${slug}/race-result`));
        jobs.push({ fixture, key, session, cached, official });
    }
}

let next = 0, successes = 0, failures = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < jobs.length) {
        const { fixture, key, session, cached, official } = jobs[next++];
        const definition = definitions[key];
        let apiRows = [];
        try {
            const api = await fetchData(session.source);
            const details = Array.isArray(api.races) ? api.races[0] : api.races;
            if (Number(details?.round) !== Number(fixture.round) || details.raceId !== fixture.raceId) throw new Error("API session race identity mismatch");
            if (!Array.isArray(details[definition.field]) || !details[definition.field].length) throw new Error("Session results not published");
            apiRows = normalizeAPI(details[definition.field], key);
        } catch (error) { console.warn(`Round ${fixture.round} ${key}: API ${error.message}`); }
        try {
            if (!official) throw new Error("No matching official race page");
            const source = `https://www.formula1.com${official.replace(/race-result$/, definition.official)}`;
            const document = await fetchData(source, false);
            session.results = mergeOfficial(document, key, apiRows);
            session.apiSource = session.source;
            session.source = source;
        } catch (error) {
            console.warn(`Round ${fixture.round} ${key}: official ${error.message}`);
            session.results = apiRows;
        }
        if (!session.results.length) {
            if (cached?.results?.length) Object.assign(session, cached, { date: session.date, startTime: session.startTime });
            failures++;
            continue;
        }
        if (key === "sprint" && official) {
            try {
                const gridSource = `https://www.formula1.com${official.replace(/race-result$/, "sprint-grid")}`;
                const gridDocument = await fetchData(gridSource, false);
                const grid = new Map(parseRows(gridDocument).map(cells => [cells[1], cells[0]]));
                // Grid tables can omit lap-time columns, so parse their rows separately.
                for (const raw of gridDocument.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
                    const cells = [...raw[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => clean(cell[1]));
                    if (cells.length >= 4 && /^\d+$/.test(cells[1])) grid.set(cells[1], cells[0]);
                }
                for (const result of session.results) if (grid.has(String(result.driver.number))) result.grid = grid.get(String(result.driver.number));
                const notes = clean(gridDocument.match(/Table-module_footer-content[^>]*>([\s\S]*?)<\/div>/)?.[1] || "");
                let subjects = [];
                for (const sentence of notes.split(/(?<=[.!;])\s+(?=[A-Z])/)) {
                    const named = session.results.filter(result => normalize(sentence).split(/[^a-z]+/).includes(normalize(result.driver.surname).split(/\s+/).at(-1)));
                    if (named.length) subjects = named;
                    if (/\bpit[ -]?lane\b/i.test(sentence) && /start|started|starting/i.test(sentence)) {
                        subjects.forEach(result => { result.grid = "Pit lane"; });
                    }
                }
                session.gridSource = gridSource;
            } catch (error) { console.warn(`Round ${fixture.round} sprint grid: ${error.message}`); }
        }
        session.status = "CONCLUDED";
        session.checkedDate = today;
        successes++;
        if (successes % 10 === 0) console.log(`Loaded ${successes}/${jobs.length} weekend sessions`);
    }
}));

const snapshot = { season, schemaVersion, races };
await writeFile(output, JSON.stringify(snapshot, null, 2) + "\n");
const all = Object.values(races).flatMap(race => Object.values(race.sessions));
console.log(`${season}: ${all.filter(session => session.results.length).length} classified sessions, ${all.filter(session => !session.results.length).length} scheduled/pending, ${failures} unavailable imports`);
