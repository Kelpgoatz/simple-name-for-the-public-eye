import { readFile, writeFile } from "node:fs/promises";

const output = new URL("../f1-fixtures.json", import.meta.url);
const fixtures = JSON.parse(await readFile(output, "utf8"));
const penalties = JSON.parse(await readFile(new URL("../f1-penalties.json", import.meta.url), "utf8"));
const plain = html => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
const normalize = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const missing = grid => grid == null || /^(?:not available|n\/a|unknown|[-–]|0)?$/i.test(String(grid).trim());
let corrected = 0;
for (const race of fixtures.races) {
    if (!race.results?.some(result => missing(result.grid))) continue;
    const resultSource = penalties.season === fixtures.season && penalties.coverage?.[race.raceId]?.source;
    if (!resultSource) continue;
    const source = resultSource.replace(/\/race-result$/, "/starting-grid");
    try {
        const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const gridByNumber = new Map();
        for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
            const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(cell => plain(cell[1]));
            if (cells.length >= 3 && /^\d+$/.test(cells[1])) gridByNumber.set(cells[1], cells[0]);
        }
        if (!gridByNumber.size) throw new Error("No starting grid found");
        const notes = plain(html.match(/Table-module_footer-content[^>]*>([\s\S]*?)<\/div>/)?.[1] || "");
        const pitLane = new Set();
        let subjects = [];
        for (const sentence of notes.split(/(?<=[.!;])\s+(?=[A-Z])/)) {
            const named = race.results.filter(result => {
                const surname = normalize(result.driver.surname).split(/\s+/).at(-1);
                return normalize(sentence).split(/[^a-z]+/).includes(surname);
            });
            if (named.length) subjects = named;
            // The source sometimes continues with "Required to start from the pit lane".
            if (/\bpit[ -]lane\b/i.test(sentence) && /start|started|starting/i.test(sentence)) {
                subjects.forEach(result => pitLane.add(result.driverId));
            }
        }
        for (const result of race.results) {
            if (!missing(result.grid)) continue;
            const grid = pitLane.has(result.driverId) ? "Pit lane" : gridByNumber.get(String(result.driver.number));
            if (!grid || (!/^\d+$/.test(grid) && !/^(?:pit lane|pl)$/i.test(grid))) continue;
            result.grid = /^(?:pit lane|pl)$/i.test(grid) ? "Pit lane" : grid;
            result.gridSource = source;
            corrected++;
        }
    } catch (error) {
        console.warn(`${race.raceId}: starting-grid source unavailable (${error.message})`);
    }
}
await writeFile(output, JSON.stringify(fixtures, null, 2) + "\n");
console.log(`Confirmed ${corrected} missing grid entries against official starting grids.`);
