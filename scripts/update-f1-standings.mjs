import { readFile, writeFile } from "node:fs/promises";
import { createJolpicaClient } from './lib/jolpica-client.mjs';
import { createF1Identities, normalizeStandings } from './lib/f1-source.mjs';

const kind = process.argv[2];
if (!["drivers", "constructors"].includes(kind)) throw new Error("Choose drivers or constructors");
// Follow the published calendar; retain a consistent season if next year's API is not ready.
const fixtures = JSON.parse(await readFile(new URL("../f1-fixtures.json", import.meta.url), "utf8"));
const season = Number(fixtures.season);
if (!Number.isInteger(season) || season < 1950) throw new Error("Invalid calendar season");
const saved = async file => { try { return JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8')); } catch { return null; } };
const identities = createF1Identities({ fixtures, drivers: await saved('drivers-championship.json'), constructors: await saved('constructors-championship.json') });
const request = createJolpicaClient();
const data = normalizeStandings(await request(`${season}/${kind === 'drivers' ? 'driverStandings' : 'constructorStandings'}/?limit=100`), season, kind, identities);
await writeFile(new URL(`../${kind}-championship.json`, import.meta.url), JSON.stringify(data, null, 2) + "\n");
console.log(`${season} ${kind}: ${data[`${kind}_championship`].length} standings (Jolpica F1)`);
