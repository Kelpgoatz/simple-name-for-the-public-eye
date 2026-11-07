(function (root) {
    const pending = new Map();

    async function request(path, timeout, signal) {
        const controller = new AbortController();
        const cancel = () => controller.abort(signal.reason);
        if (signal?.aborted) cancel();
        else signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(() => {
            controller.abort(new DOMException('The saved sports update took too long to load.', 'TimeoutError'));
        }, timeout);

        try {
            if (controller.signal.aborted) throw controller.signal.reason;
            const response = await root.fetch(path, { cache: 'no-cache', signal: controller.signal });
            if (!response.ok) throw new Error(`Snapshot request failed (HTTP ${response.status}): ${path}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
        }
    }

    function read(path, { timeout = 8000, signal } = {}) {
        if (signal) return request(path, timeout, signal);
        const key = JSON.stringify([path, timeout]);
        if (!pending.has(key)) pending.set(key, request(path, timeout).finally(() => pending.delete(key)));
        return pending.get(key);
    }

    const api = { read };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SportsSnapshots = api;
})(globalThis);
