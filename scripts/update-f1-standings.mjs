import { readFile, writeFile } from "node:fs/promises";

const kind = process.argv[2];
if (!["drivers", "constructors"].includes(kind)) throw new Error("Choose drivers or constructors");
// Follow the published calendar; retain a consistent season if next year's API is not ready.
const fixtures = JSON.parse(await readFile(new URL("../f1-fixtures.json", import.meta.url), "utf8"));
const season = Number(fixtures.season);
if (!Number.isInteger(season) || season < 1950) throw new Error("Invalid calendar season");
const response = await fetch(`https://f1api.dev/api/${season}/${kind}-championship`, {
    signal: AbortSignal.timeout(30000)
});
if (!response.ok) throw new Error(`Standings fetch failed (${response.status}); retaining previous snapshot`);
const data = await response.json();
const key = `${kind}_championship`;
if (Number(data.season) !== season || !Array.isArray(data[key])) {
    throw new Error("Invalid standings response; retaining previous snapshot");
}
await writeFile(new URL(`../${kind}-championship.json`, import.meta.url), JSON.stringify(data, null, 2) + "\n");
console.log(`${season} ${kind}: ${data[key].length} standings`);
