import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRecap, RecapGenerationError, countWords, DEFAULT_MODEL} from '../src/ai.mjs';

const apiKey = 'sk-test-PRIVATE-DO-NOT-LOG';
const facts = () => ({sport: 'f1', name: 'Formula 1', week: {id: '2026-11-09', start: '2026-11-02T07:00:00Z', end: '2026-11-09T07:00:00Z', label: 'Week ending 9 November', timeZone: 'Australia/Sydney'}, coverage: {status: 'ready'}, sources: [{id: 'source-1', url: 'https://example.com/official', label: 'Official results'}], events: [{id: 'event-1', startTime: '2026-11-08T05:00:00Z', kind: 'race', label: 'Recorded race', winner: 'Example Driver'}]});
const article = (words = 500) => ({title: 'The recorded week in sport', paragraphs: [Array.from({length: words}, (_, i) => `word${i}`).join(' ')], highlights: [{text: 'Example Driver won the recorded race.', eventIds: ['event-1']}], eventIds: ['event-1']});
const envelope = value => ({id: 'resp_mock123', status: 'completed', output: [{type: 'reasoning', summary: []}, {type: 'message', status: 'completed', content: [{type: 'output_text', text: JSON.stringify(value)}]}], usage: {input_tokens: 100, output_tokens: 800, total_tokens: 900, output_tokens_details: {reasoning_tokens: 80}}});
const success = value => ({ok: true, status: 200, json: async () => envelope(value)});
const http = (status, retryAfter = null) => ({ok: false, status, headers: {get: () => retryAfter}, json: async () => {throw new Error(`Never inspect provider error bodies: ${apiKey}`);}});

test('Responses request uses strict JSON schema, stateless storage, bounded output and header-only credentials', async () => {
    let request;
    const recap = await generateRecap(facts(), {apiKey, fetchImpl: async (url, options) => {request = {url, options}; return success(article());}});
    const body = JSON.parse(request.options.body);
    assert.equal(request.url, 'https://api.openai.com/v1/responses');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, `Bearer ${apiKey}`);
    assert.equal(body.model, DEFAULT_MODEL);
    assert.equal(body.store, false);
    assert.deepEqual(body.reasoning, {effort: 'low'});
    assert.equal(body.max_output_tokens, 6000);
    assert.equal(body.text.format.type, 'json_schema');
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.schema.additionalProperties, false);
    assert.equal(body.text.format.schema.properties.highlights.items.additionalProperties, false);
    assert.deepEqual(body.text.format.schema.properties.eventIds.items.enum, ['event-1']);
    assert.deepEqual(body.text.format.schema.required, ['title', 'paragraphs', 'highlights', 'eventIds']);
    assert.deepEqual(JSON.parse(body.input[0].content[0].text), facts());
    assert.doesNotMatch(request.options.body, /sk-test-PRIVATE/);
    assert.match(body.instructions, /untrusted data/);
    assert.match(body.instructions, /Australian English/);
    assert.equal(recap.wordCount, 500);
    assert.equal(recap.attempts, 1);
    assert.equal(recap.responseId, 'resp_mock123');
    assert.equal(recap.usage.reasoningTokens, 80);
    assert.deepEqual(recap.eventIds, ['event-1']);
});

test('missing events, unavailable coverage, invalid identities and absent credentials make no API request', async () => {
    let calls = 0;
    const fetchImpl = async () => {calls++; return success(article());};
    for (const packet of [{...facts(), events: []}, {...facts(), coverage: {status: 'no_events'}}, {...facts(), coverage: {status: 'unavailable'}}, {...facts(), events: [{id: 'duplicate'}, {id: 'duplicate'}]}]) {
        await assert.rejects(generateRecap(packet, {apiKey, fetchImpl}), error => error instanceof RecapGenerationError && error.attempts === 0);
    }
    await assert.rejects(generateRecap(facts(), {fetchImpl}), error => error.code === 'MISSING_API_KEY');
    assert.equal(calls, 0);
});

test('word-count boundaries are inclusive and a short body receives only one bounded correction', async () => {
    for (const words of [450, 550]) assert.equal((await generateRecap(facts(), {apiKey, fetchImpl: async () => success(article(words))})).wordCount, words);
    const requests = [];
    const recap = await generateRecap(facts(), {apiKey, fetchImpl: async (_, options) => {requests.push(JSON.parse(options.body)); return success(article(requests.length === 1 ? 449 : 500));}});
    assert.equal(recap.attempts, 2);
    assert.match(requests[1].instructions, /Final correction attempt.*WORD_COUNT/);
    assert.equal(requests[1].input.length, 1);
    assert.deepEqual(requests[1].input, requests[0].input);
    let calls = 0;
    await assert.rejects(generateRecap(facts(), {apiKey, maxAttempts: 50, fetchImpl: async () => {calls++; return success(article(551));}}), error => error.code === 'WORD_COUNT' && error.attempts === 2 && error.quarantinable);
    assert.equal(calls, 2);
    assert.equal(countWords(' First\n second   third '), 3);
});

test('unsupported event IDs, unrelated links and extra schema fields are rejected rather than published', async () => {
    const bad = [
        {...article(), eventIds: ['invented-event']},
        {...article(), highlights: [{text: 'A claim', eventIds: ['invented-event']}]},
        {...article(), highlights: [{text: 'See https://invented.example/result', eventIds: ['event-1']}]},
        {...article(), unknown: 'Not in the schema'}
    ];
    for (const value of bad) await assert.rejects(generateRecap(facts(), {apiKey, maxAttempts: 1, fetchImpl: async () => success(value)}), error => error.quarantinable && error.attempts === 1);
    const packet = facts(); packet.events.push({id: 'event-2'});
    await assert.rejects(generateRecap(packet, {apiKey, maxAttempts: 1, fetchImpl: async () => success({...article(), highlights: [{text: 'Uncited claim', eventIds: ['event-2']}]})}), error => error.code === 'UNSUPPORTED_EVENT_IDS');
});

test('refusals, incomplete responses and malformed JSON fail safely without another paid attempt', async () => {
    const variants = [
        {...envelope(article()), output: [{type: 'message', status: 'completed', content: [{type: 'refusal', refusal: apiKey}]}]},
        {...envelope(article()), status: 'incomplete', incomplete_details: {reason: apiKey}},
        {...envelope(article()), output: [{type: 'message', status: 'completed', content: [{type: 'output_text', text: `invalid JSON ${apiKey}`}]}]}
    ];
    for (const payload of variants) {
        let calls = 0;
        await assert.rejects(generateRecap(facts(), {apiKey, fetchImpl: async () => {calls++; return {ok: true, status: 200, json: async () => payload};}}), error => error.quarantinable && !JSON.stringify(error).includes(apiKey) && !error.message.includes(apiKey));
        assert.equal(calls, 1);
    }
});

test('text extraction supports multiple output_text chunks and excludes reasoning text', async () => {
    const text = JSON.stringify(article()), cut = Math.floor(text.length / 2), payload = envelope(article());
    payload.output[0].summary = [{type: 'summary_text', text: 'This is not JSON output.'}];
    payload.output[1].content = [{type: 'output_text', text: text.slice(0, cut)}, {type: 'output_text', text: text.slice(cut)}];
    const recap = await generateRecap(facts(), {apiKey, fetchImpl: async () => ({ok: true, status: 200, json: async () => payload})});
    assert.equal(recap.wordCount, 500);
});

test('malformed output containers fail with safe quarantinable errors instead of leaking provider fields', async () => {
    for (const output of [[null], [{type: 'message', content: {private: apiKey}}], [{type: 'message', content: [null]}], [{type: 'message', content: [{type: 'output_text', text: {private: apiKey}}]}]]) {
        let calls = 0;
        await assert.rejects(generateRecap(facts(), {apiKey, fetchImpl: async () => {calls++; return {ok: true, status: 200, json: async () => ({status: 'completed', output})};}}), error => error instanceof RecapGenerationError && error.code === 'INVALID_RESPONSE' && error.quarantinable && !error.message.includes(apiKey));
        assert.equal(calls, 1);
    }
});

test('429 and server retries honor Retry-After and share the total two-call budget with article repair', async () => {
    let calls = 0; const waits = [];
    const recap = await generateRecap(facts(), {apiKey, sleepImpl: async ms => waits.push(ms), fetchImpl: async () => ++calls === 1 ? http(429, '12') : success(article())});
    assert.equal(recap.attempts, 2);
    assert.deepEqual(waits, [12000]);
    calls = 0;
    await assert.rejects(generateRecap(facts(), {apiKey, sleepImpl: async () => {}, fetchImpl: async () => ++calls === 1 ? http(503, '0') : success(article(100))}), error => error.code === 'WORD_COUNT' && error.attempts === 2);
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(generateRecap(facts(), {apiKey, sleepImpl: async () => {}, fetchImpl: async () => ++calls === 1 ? success(article(100)) : http(503, '0')}), error => error.code === 'HTTP_ERROR' && error.attempts === 2);
    assert.equal(calls, 2);
});

test('long cooldowns and permanent HTTP errors do not bypass the server or expose its body', async () => {
    for (const [status, retryAfter] of [[429, '61'], [401, null], [402, null]]) {
        let calls = 0, waits = 0;
        await assert.rejects(generateRecap(facts(), {apiKey, sleepImpl: async () => {waits++;}, fetchImpl: async () => {calls++; return http(status, retryAfter);}}), error => error.status === status && !error.message.includes(apiKey));
        assert.equal(calls, 1); assert.equal(waits, 0);
    }
    const waits = [], at = Date.parse('2026-11-09T07:00:00Z'); let calls = 0;
    await generateRecap(facts(), {apiKey, nowImpl: () => at, sleepImpl: async ms => waits.push(ms), fetchImpl: async () => ++calls === 1 ? http(503, 'Mon, 09 Nov 2026 07:00:30 GMT') : success(article())});
    assert.deepEqual(waits, [30000]);
});

test('uncertain POST transport failures are not retried and cannot leak credentials through error causes', async () => {
    let calls = 0;
    await assert.rejects(generateRecap(facts(), {apiKey, fetchImpl: async () => {calls++; throw new Error(`network timeout carrying ${apiKey}`);}}), error => error.code === 'UNCERTAIN_REQUEST' && error.attempts === 1 && !error.message.includes(apiKey) && !error.cause);
    assert.equal(calls, 1);
    const controller = new AbortController(); controller.abort(new Error(apiKey));
    await assert.rejects(generateRecap(facts(), {apiKey, signal: controller.signal, fetchImpl: async () => {calls++;}}), error => error.code === 'ABORTED' && error.attempts === 0);
    assert.equal(calls, 1);
});

test('legacy model overrides omit unsupported reasoning options and secrets echoed in output are rejected', async () => {
    let body;
    await generateRecap(facts(), {apiKey, model: 'gpt-4.1-mini', fetchImpl: async (_, options) => {body = JSON.parse(options.body); return success(article());}});
    assert.equal(body.model, 'gpt-4.1-mini');
    assert.equal(Object.hasOwn(body, 'reasoning'), false);
    let calls = 0;
    await assert.rejects(generateRecap(facts(), {apiKey, fetchImpl: async () => {calls++; return success({...article(), title: apiKey});}}), error => error.code === 'SECRET_IN_OUTPUT' && !error.message.includes(apiKey));
    assert.equal(calls, 1);
});
