const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('../snapshot-loader.js');

test('concurrent readers share one request and a later retry can recover', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
    const first = read('example.json');
    assert.equal(read('example.json'), first);
    await assert.rejects(first, /HTTP 503/);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.mockImplementation(async () => Response.json({ season: 2026 }));
    assert.deepEqual(await read('example.json'), { season: 2026 });
    assert.equal(fetch.mock.calls[1].arguments[1].cache, 'no-cache');
});

test('the deadline applies while reading the JSON body', async t => {
    t.mock.method(globalThis, 'fetch', async (_, { signal }) => ({
        ok: true,
        json: () => new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    }));
    await assert.rejects(read('slow.json', { timeout: 20 }), { name: 'TimeoutError' });
});

test('cancelling one reader does not cancel the shared request', async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json([]));
    const controller = new AbortController();
    controller.abort();
    const cancelled = read('example.json', { signal: controller.signal });
    const shared = read('example.json');
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.deepEqual(await shared, []);
    assert.equal(fetch.mock.callCount(), 1);
});
