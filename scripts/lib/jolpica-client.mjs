export const JOLPICA_BASE_URL = 'https://api.jolpi.ca/ergast/f1/';
export const JOLPICA_USER_AGENT = 'cgrillo/1.0 (+https://github.com/Kelpgoatz/simple-name-for-the-public-eye)';

// Unauthenticated limits: 4 requests/second and 500/hour. A 7.5-second
// interval leaves headroom below the sustained limit, including retries.
// https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md
const DEFAULT_INTERVAL_MS = 7500;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export class JolpicaError extends Error {
    constructor(message, {status = null, retryAfterMs = null, cause} = {}) {
        super(message, cause ? {cause} : undefined);
        this.name = 'JolpicaError';
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}

export function retryAfterMilliseconds(value, now = Date.now()) {
    if (value == null || String(value).trim() === '') return null;
    const text = String(value).trim();
    if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text) * 1000;
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

export function createJolpicaClient({
    fetchImpl = globalThis.fetch,
    now = Date.now,
    sleep = pause,
    minIntervalMs = DEFAULT_INTERVAL_MS,
    maxAttempts = 4,
    maxRetryWaitMs = 120000,
    timeoutMs = 25000,
    onRetry = message => console.warn(message)
} = {}) {
    if (typeof fetchImpl !== 'function' || !Number.isFinite(minIntervalMs) || minIntervalMs < 0
        || !Number.isInteger(maxAttempts) || maxAttempts < 1
        || !Number.isFinite(maxRetryWaitMs) || maxRetryWaitMs < 0) {
        throw new Error('Invalid Jolpica client configuration');
    }
    let queue = Promise.resolve();
    let nextRequestAt = 0;
    const requests = new Map();

    async function waitForSlot(path) {
        const delay = Math.max(0, nextRequestAt - now());
        if (delay > maxRetryWaitMs) {
            throw new JolpicaError(`${path}: Jolpica cooldown exceeds this run's retry budget; saved data retained`, {status: 429, retryAfterMs: delay});
        }
        if (delay) await sleep(delay);
        nextRequestAt = now() + minIntervalMs;
    }

    async function perform(path, url) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await waitForSlot(path);
            let response;
            try {
                response = await fetchImpl(url, {
                    headers: {'User-Agent': JOLPICA_USER_AGENT, Accept: 'application/json'},
                    signal: AbortSignal.timeout(timeoutMs)
                });
            } catch (cause) {
                if (attempt + 1 === maxAttempts) throw new JolpicaError(`${path}: ${cause.message}`, {cause});
                const delay = 2000 * 2 ** attempt;
                nextRequestAt = Math.max(nextRequestAt, now() + delay);
                onRetry(`${path}: network error; retrying after ${Math.ceil(Math.max(delay, nextRequestAt - now()) / 1000)}s`);
                continue;
            }
            if (response.ok) {
                let data;
                try { data = await response.json(); }
                catch (cause) { throw new JolpicaError(`${path}: Invalid Jolpica JSON response`, {status: response.status, cause}); }
                if (!data?.MRData || typeof data.MRData !== 'object' || Array.isArray(data.MRData)) {
                    throw new JolpicaError(`${path}: Invalid Jolpica response`, {status: response.status});
                }
                // Empty result/standings tables are valid before publication.
                return data;
            }
            const retryAfterMs = retryAfterMilliseconds(response.headers?.get('retry-after'), now());
            const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
            const fallbackDelay = (response.status === 429 ? 30000 : 2000) * 2 ** attempt;
            const delay = Math.max(retryAfterMs ?? 0, fallbackDelay);
            if (retryable) nextRequestAt = Math.max(nextRequestAt, now() + delay);
            const error = new JolpicaError(`${path}: HTTP ${response.status}${delay > maxRetryWaitMs && retryable ? '; retry deferred to a later run' : ''}`, {
                status: response.status, retryAfterMs
            });
            if (!retryable || attempt + 1 === maxAttempts || delay > maxRetryWaitMs) throw error;
            onRetry(`${path}: HTTP ${response.status}; retrying after ${Math.ceil(Math.max(delay, nextRequestAt - now()) / 1000)}s`);
        }
    }

    return function request(path) {
        const url = new URL(path, JOLPICA_BASE_URL);
        if (url.origin !== new URL(JOLPICA_BASE_URL).origin || !url.pathname.startsWith('/ergast/f1/')) {
            return Promise.reject(new Error('Jolpica request must use the Ergast F1 API'));
        }
        const key = url.href;
        if (requests.has(key)) return requests.get(key);
        const result = queue.then(() => perform(path, url));
        queue = result.catch(() => {});
        requests.set(key, result);
        // Reuse successful requests for aliases within this import. A failed
        // request may be retried later, subject to the same server cooldown.
        result.catch(() => { if (requests.get(key) === result) requests.delete(key); });
        return result;
    };
}
