const test = require('node:test');
const assert = require('node:assert/strict');
const source = import('../scripts/lib/jolpica-client.mjs');

function clock(start = 0) {
    let time = start;
    const waits = [];
    return {now: () => time, sleep: async ms => { waits.push(ms); time += ms; }, waits};
}
const ok = data => ({ok: true, status: 200, json: async () => data || {MRData: {RaceTable: {Races: []}}}});
const failed = (status, retryAfter = null) => ({ok: false, status, headers: {get: () => retryAfter}});

test('Jolpica client serializes requests below sustained limits, sends application identity and shares duplicates', async () => {
    const {createJolpicaClient, JOLPICA_USER_AGENT} = await source;
    const time = clock(), starts = [], headers = [];
    const request = createJolpicaClient({...time, fetchImpl: async (url, options) => {
        starts.push(time.now()); headers.push(options.headers); return ok();
    }});
    const rows = await Promise.all([request('2026/'), request('2026/drivers/'), request('2026/'), request('2026/constructors/')]);
    assert.deepEqual(starts, [0, 7500, 15000]);
    assert.equal(rows[0], rows[2]);
    assert.equal(headers[0]['User-Agent'], JOLPICA_USER_AGENT);
    assert.equal(headers[0].Accept, 'application/json');
    assert.deepEqual(rows[0].MRData.RaceTable.Races, []);
});

test('Jolpica client honors Retry-After cooldown for all queued work', async () => {
    const {createJolpicaClient} = await source;
    const time = clock(), starts = [], messages = [];
    let count = 0;
    const request = createJolpicaClient({...time, onRetry: value => messages.push(value), fetchImpl: async () => {
        starts.push(time.now()); return count++ === 0 ? failed(429, '60') : ok();
    }});
    await Promise.all([request('2026/'), request('2026/drivers/')]);
    assert.deepEqual(starts, [0, 60000, 67500]);
    assert.match(messages[0], /HTTP 429.*60s/);
});

test('Retry-After supports HTTP dates and does not treat invalid values as immediate retries', async () => {
    const {retryAfterMilliseconds} = await source;
    assert.equal(retryAfterMilliseconds('Fri, 06 Nov 2026 10:01:00 GMT', Date.parse('2026-11-06T10:00:00Z')), 60000);
    assert.equal(retryAfterMilliseconds('12.5', 0), 12500);
    assert.equal(retryAfterMilliseconds('invalid', 0), null);
    assert.equal(retryAfterMilliseconds('', 0), null);
});

test('Jolpica client defers long server cooldowns without retrying early or hammering following calls', async () => {
    const {createJolpicaClient} = await source;
    const time = clock(); let count = 0;
    const request = createJolpicaClient({...time, minIntervalMs: 0, fetchImpl: async () => { count++; return failed(429, '600'); }});
    await assert.rejects(request('2026/'), /HTTP 429.*deferred/);
    await assert.rejects(request('2026/drivers/'), /cooldown exceeds/);
    assert.equal(count, 1);
    assert.deepEqual(time.waits, []);
});

test('Jolpica client bounds retries, retries transient failures and preserves permanent error status', async () => {
    const {createJolpicaClient} = await source;
    const time = clock(); let count = 0;
    const request = createJolpicaClient({...time, minIntervalMs: 0, maxAttempts: 3, onRetry: () => {}, fetchImpl: async () => { count++; return failed(503); }});
    await assert.rejects(request('2026/'), error => error.status === 503);
    assert.equal(count, 3);
    assert.deepEqual(time.waits, [2000, 4000]);
    let permanentCount = 0;
    const permanent = createJolpicaClient({...clock(), fetchImpl: async () => { permanentCount++; return failed(404); }});
    await assert.rejects(permanent('2026/'), error => error.status === 404);
    assert.equal(permanentCount, 1);
});

test('Jolpica client rejects corrupt payloads and unrelated hosts while allowing later calls after errors', async () => {
    const {createJolpicaClient} = await source;
    const time = clock(); let count = 0;
    const request = createJolpicaClient({...time, minIntervalMs: 0, fetchImpl: async () => ++count === 1 ? ok({html: 'unavailable'}) : ok()});
    await assert.rejects(request('2026/'), /Invalid Jolpica response/);
    await assert.rejects(request('https://example.com/'), /must use/);
    const data = await request('2026/');
    assert.ok(data.MRData);
    assert.equal(count, 2);
});
