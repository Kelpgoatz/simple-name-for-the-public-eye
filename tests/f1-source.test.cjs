const test = require('node:test');
const assert = require('node:assert/strict');
const source = import('../scripts/lib/f1-source.mjs');
const driver = { driverId: 'arvid_lindblad', givenName: 'Arvid', familyName: 'Lindblad', permanentNumber: '41', nationality: 'British' };
const team = { constructorId: 'rb', name: 'RB F1 Team', nationality: 'Italian' };
const rawRace = { season: '2026', round: '5', raceName: 'Canadian Grand Prix', date: '2026-05-24', time: '20:00:00Z', Circuit: { circuitId: 'villeneuve', circuitName: 'Circuit Gilles Villeneuve', Location: { locality: 'Montreal', country: 'Canada' } }, FirstPractice: { date: '2026-05-22', time: '16:30:00Z' }, Sprint: { date: '2026-05-23', time: '16:00:00Z' }, SprintQualifying: { date: '2026-05-22', time: '20:30:00Z' } };
const envelope = (table, total = 1) => ({ MRData: { total: String(total), url: 'https://api.jolpi.ca/ergast/f1/2026/', RaceTable: { season: '2026', round: '5', Races: [table] } } });
const saved = { season: 2026, races: [{ round: 5, circuitId: 'gilles_villeneuve', raceId: 'canadian_2026', name: 'Formula 1 Lenovo Grand Prix du Canada', lengthKm: 4.361, laps: 70 }] };
const identities = async () => (await source).createF1Identities({ drivers: { drivers_championship: [{ driverId: 'lindblad', driver: { name: 'Arvid', surname: 'Lindblad', number: 41 } }] }, constructors: { constructors_championship: [{ teamId: 'rb', team: { teamName: 'Racing Bulls' } }] } });

test('calendar source migration retains canonical circuit, full race name and linked weekend identity', async () => {
    const { normalizeCalendar } = await source;
    const race = normalizeCalendar(envelope(rawRace), 2026, saved).races[0];
    assert.equal(race.raceId, 'canadian_2026');
    assert.equal(race.raceName, saved.races[0].name);
    assert.equal(race.circuit.circuitId, 'gilles_villeneuve');
    assert.equal(race.circuit.circuitLength, 4.361);
    assert.equal(race.schedule.sprintRace.date, '2026-05-23');
    assert.equal(race.schedule.sprintQualy.time, '20:30:00Z');
    assert.equal(race.schedule.fp2, undefined);
});
test('next season receives new race identities and published dates instead of copying the old year', async () => {
    const { normalizeCalendar } = await source;
    const data = envelope({ ...rawRace, season: '2027', date: '2027-05-23' });
    data.MRData.RaceTable.season = '2027';
    const race = normalizeCalendar(data, 2027, saved).races[0];
    assert.match(race.raceId, /_2027$/);
    assert.equal(race.raceName, 'Formula 1 Canadian Grand Prix');
    assert.equal(race.schedule.race.date, '2027-05-23');
    assert.equal(race.laps, null);
});
test('multiple weekends at one circuit keep distinct saved weekend identities', async () => {
    const { normalizeCalendar } = await source;
    const previous = structuredClone(saved);
    previous.races.push({ ...previous.races[0], round: 6, raceId: 'second_canada_2026', name: 'Second Grand Prix' });
    const payload = envelope(rawRace, 2);
    payload.MRData.RaceTable.Races.push({ ...rawRace, round: '6', raceName: 'Second Grand Prix' });
    assert.deepEqual(normalizeCalendar(payload, 2026, previous).races.map(row => row.raceId), ['canadian_2026', 'second_canada_2026']);
});
test('incomplete and wrong-season calendars are rejected before replacing saved fixtures', async () => {
    const { normalizeCalendar } = await source;
    assert.throws(() => normalizeCalendar(envelope(rawRace, 2), 2026, saved), /incomplete/);
    assert.throws(() => normalizeCalendar(envelope(rawRace), 2027, saved), /mismatch/);
});
test('new standings source keeps existing driver and team identities used by flags and profiles', async () => {
    const { normalizeStandings } = await source;
    const data = { MRData: { total: '1', url: 'https://api.jolpi.ca/', StandingsTable: { season: '2026', StandingsLists: [{ season: '2026', DriverStandings: [{ position: '8', points: '23', wins: '0', Driver: driver, Constructors: [team] }] }] } } };
    const row = normalizeStandings(data, 2026, 'drivers', await identities()).drivers_championship[0];
    assert.equal(row.driverId, 'lindblad');
    assert.equal(row.driver.name, 'Arvid');
    assert.equal(row.teamId, 'rb');
    assert.equal(row.team.teamName, 'Racing Bulls');
    assert.equal(row.points, 23);
    assert.throws(() => normalizeStandings(data, 2027, 'drivers', {}), /mismatch/);
});
test('race results distinguish lapped finishers, retirements, missing grid and real fastest laps', async () => {
    const { normalizeResults } = await source;
    const row = { Driver: driver, Constructor: team, position: '1', positionText: '1', points: '25', grid: '1', laps: '70', status: 'Finished', Time: { time: '1:30:00.000' }, FastestLap: { lap: '40', Time: { time: '1:13.456' } } };
    const payload = envelope({ ...rawRace, Results: [row, { ...row, position: '2', positionText: '2', points: '18', grid: '0', laps: '69', status: 'Lapped', Time: { time: '+5.123' }, FastestLap: null }, { ...row, position: '3', positionText: 'R', points: '0', laps: '20', status: 'Engine', Time: null }] }, 3);
    const results = normalizeResults(payload, 2026, 5, await identities());
    assert.equal(results[0].fastLap, '1:13.456');
    assert.equal(results[0].fastestLapNumber, 40);
    assert.equal(results[1].time, '+1 lap');
    assert.equal(results[1].retired, null);
    assert.equal(results[1].grid, null);
    assert.equal(results[1].fastLap, null);
    assert.equal(results[2].retired, 'Engine');
    assert.equal(results[0].driverId, 'lindblad');
    assert.throws(() => normalizeResults(payload, 2026, 6, {}), /mismatch/);
});
test('qualifying source preserves phase times and does not invent lap counts', async () => {
    const { normalizeQualifying } = await source;
    const payload = envelope({ ...rawRace, QualifyingResults: [{ Driver: driver, Constructor: team, position: '1', Q1: '1:14.100', Q2: '1:13.900', Q3: '1:13.500' }] });
    const [row] = normalizeQualifying(payload, 2026, 5, await identities());
    assert.equal(row.bestLap, '1:13.500');
    assert.equal(row.timingSegment, 'Q3');
    assert.equal(row.lapsCompleted, null);
});
test('fixture importer keeps linked driver IDs, official pit-lane confirmation and fastest lap attribution end to end', async () => {
    const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
    const { spawnSync } = require('node:child_process');
    const root = path.resolve(__dirname, '..');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cgrillo-f1-source-test-'));
    try {
        for (const file of ['scripts/update-f1-fixtures.mjs', 'scripts/lib/f1-source.mjs', 'scripts/lib/jolpica-client.mjs']) {
            await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
            await fs.copyFile(path.join(root, file), path.join(directory, file));
        }
        const fixture = structuredClone(saved);
        fixture.races[0].results = [{ driverId: 'lindblad', driver: { name: 'Arvid', surname: 'Lindblad', number: 41 }, grid: 'Pit lane', gridSource: 'https://www.formula1.com/starting-grid' }];
        await fs.writeFile(path.join(directory, 'f1-fixtures.json'), JSON.stringify(fixture));
        const first = { Driver: driver, Constructor: team, position: '1', positionText: '1', points: '25', grid: '0', number: '41', laps: '70', status: 'Finished', Time: { time: '1:30:00.000' }, FastestLap: { rank: '2', Time: { time: '1:13.456' } } };
        const raceResult = envelope({ ...rawRace, Results: [first, { ...first, Driver: { ...driver, driverId: 'russell', givenName: 'George', familyName: 'Russell', permanentNumber: '63' }, position: '2', positionText: '2', points: '18', number: '63', FastestLap: { rank: '1', Time: { time: '1:13.456' } } }] }, 2);
        const preload = path.join(directory, 'mock.mjs');
        await fs.writeFile(preload, `let clock=Date.parse('2026-11-06T00:00:00Z');Date.now=()=>clock+=10000;globalThis.fetch=async url=>{url=String(url);if(!url.startsWith('https://api.jolpi.ca/ergast/f1/2026/'))throw Error('Unexpected host '+url);return new Response(JSON.stringify(url.includes('/results/')?${JSON.stringify(raceResult)}:${JSON.stringify(envelope(rawRace))}),{status:200});};`);
        const result = spawnSync(process.execPath, ['--import', require('node:url').pathToFileURL(preload).href, path.join(directory, 'scripts/update-f1-fixtures.mjs'), '2026'], { encoding: 'utf8', timeout: 15000 });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const snapshot = JSON.parse(await fs.readFile(path.join(directory, 'f1-fixtures.json'), 'utf8'));
        const [race] = snapshot.races, [row] = race.results;
        assert.equal(row.driverId, 'lindblad');
        assert.equal(row.driver.name, 'Arvid');
        assert.equal(row.grid, 'Pit lane');
        assert.equal(row.points, 25);
        assert.equal(race.fastestLap.driverId, 'russell', 'the source rank resolves equal lap times instead of race position');
        assert.equal(race.fastestLap.time, '1:13.456');
        assert.equal(race.status, 'CONCLUDED');
        assert.equal(race.name, saved.races[0].name);
        assert.equal(race.sessionSchedule.sprintRace.date, '2026-05-23');
    } finally {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith('cgrillo-f1-source-test-'));
        await fs.rm(directory, { recursive: true, force: true });
    }
});
