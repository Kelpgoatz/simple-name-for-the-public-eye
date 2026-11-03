import { readFile, writeFile } from "node:fs/promises";

const fixtures = JSON.parse(await readFile(new URL("../f1-fixtures.json", import.meta.url), "utf8"));
const output = new URL("../f1-penalties.json", import.meta.url);
let previous;
try { previous = JSON.parse(await readFile(output, "utf8")); } catch {}
const season = fixtures.season;
// A new calendar can be available before the official results index exists.
if (!fixtures.races.some(race => race.results?.length)) {
    await writeFile(output, JSON.stringify({ season, races: {}, coverage: {} }, null, 2) + "\n");
    console.log(`${season}: no completed races yet; penalty notes reset for the new season`);
    process.exit(0);
}
const base = "https://www.formula1.com";
const slugs = {
    albert_park: "australia", shanghai: "china", suzuka: "japan", miami: "miami",
    gilles_villeneuve: "canada", monaco: "monaco", montmelo: "barcelona-catalunya",
    red_bull_ring: "austria", silverstone: "great-britain", spa: "belgium",
    hungaroring: "hungary", zandvoort: "netherlands", monza: "italy", madring: "spain",
    baku: "azerbaijan", sepang: "bahrain", bahrein: "bahrain", marina_bay: "singapore",
    austin: "united-states", hermanos_rodriguez: "mexico", interlagos: "brazil",
    vegas: "las-vegas", lusail: "qatar", yas_marina: "abu-dhabi", jeddah: "saudi-arabia"
};
async function html(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    return response.text();
}
const plain = value => value.replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;|&amp;|&quot;|&apos;|&rsquo;|&lsquo;|&ndash;|&mdash;/g, entity => ({
        "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&rsquo;": "’", "&lsquo;": "‘", "&ndash;": "–", "&mdash;": "—"
    })[entity]).replace(/\s+/g, " ").trim();
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function summarize(sentence) {
    const duration = sentence.match(/(\d+|five|ten|twenty|thirty)[- ]second/i)?.[1];
    const seconds = ({ five: 5, ten: 10, twenty: 20, thirty: 30 })[duration?.toLowerCase()] || duration;
    const sanction = seconds ? `${seconds}s time penalty` : /stop.and.go/i.test(sentence) ? "Stop/go penalty" : /drive.through/i.test(sentence) ? "Drive-through penalty" : /disqualif|excluded/i.test(sentence) ? "Disqualification" : "Result penalty";
    const reason = sentence.match(/\bfor\s+(.+?)(?:,\s*with\b|[.;]|$)/i)?.[1]
        .replace(/causing a collision/gi, "collision")
        .replace(/failing to slow (?:under|for) (?:a |the )?yellow flags?/gi, "yellow-flag infringement");
    return `${sanction}${/post.race|after the race/i.test(sentence) ? " applied after race" : ""}${reason ? ` — ${reason}` : ""}.`;
}
const index = await html(`${base}/en/results/${season}/races`);
const paths = [...new Set(index.match(new RegExp(`/en/results/${season}/races/\\d+/[^"<>\\\\ ]+/race-result`, "g")))];
if (!paths.length) throw new Error("Official results index has no race links; retaining penalty data");
const races = {}, coverage = {};
let next = 0;
const completed = fixtures.races.filter(race => race.results?.length);
await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < completed.length) {
        const race = completed[next++];
        try {
            const slug = slugs[race.circuitId];
            const path = slug && paths.find(path => path.endsWith(`/${slug}/race-result`));
            if (!path) throw new Error("No matching official race page");
            const source = base + path;
            const document = await html(source);
            if (!document.includes("<table") || !document.includes("race-result")) throw new Error("Unrecognised results page");
            const footer = document.match(/class="[^"]*Table-module_footer-content[^\"]*"[^>]*>([\s\S]*?)<\/div>/);
            const notes = plain(footer?.[1] || "").replace(/^Note\s*[-–—]\s*/i, "");
            const sentences = notes.split(/(?<=[.!;])\s+(?=[A-Z])/).filter(sentence =>
                /penal|disqualif|excluded/i.test(sentence) &&
                (!/grid|starting position/i.test(sentence) || /time penalty|post.race|disqualif/i.test(sentence)));
            const drivers = {};
            const unmatched = [];
            for (const sentence of sentences) {
                let matched = false;
                for (const result of race.results) {
                    const surname = normalize(result.driver.surname).split(/\s+/).at(-1);
                    if (!surname || !normalize(sentence).split(/[^a-z]+/).includes(surname)) continue;
                    (drivers[result.driverId] ||= []).push({ note: summarize(sentence), source });
                    matched = true;
                }
                if (!matched) unmatched.push(sentence);
            }
            races[race.raceId] = drivers;
            coverage[race.raceId] = { status: unmatched.length ? "partial" : "checked", source, unmatched };
        } catch (error) {
            if (previous?.season === season && previous.races?.[race.raceId]) races[race.raceId] = previous.races[race.raceId];
            coverage[race.raceId] = { status: "unavailable" };
            console.warn(`${race.raceId}: ${error.message}; retained any prior notes`);
        }
    }
}));
// Stable ordering keeps scheduled diffs limited to actual source changes.
const ordered = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
const snapshot = { season, source: `${base}/en/results/${season}/races`, races: ordered(races), coverage: ordered(coverage) };
await writeFile(output, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`${Object.values(coverage).filter(item => item.status === "checked").length}/${completed.length} races checked; ${Object.values(races).reduce((sum, drivers) => sum + Object.values(drivers).reduce((n, notes) => n + notes.length, 0), 0)} driver penalty notes`);
