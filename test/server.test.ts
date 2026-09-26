import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { test, type TestContext } from 'node:test';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import type { EvaluationResult, Scorer } from '../src/core/types.js';

const result: EvaluationResult = { status: 'ok', relevanceScore: 0.75, confidence: 0.9, nonsenseProbability: 0.03, provider: 'test-synthetic', model: 'mock', rubricVersion: 'test-v1' };
const attribute = (key: string, value: string | number) => ({ key, value: typeof value === 'number' ? { intValue: String(value) } : { stringValue: value } });
function batch(id = 'b'.repeat(16), content = true) {
  return { resourceSpans: [{ resource: { attributes: [attribute('service.name', 'test'), attribute('openspanguard.context', 'RESOURCE_SECRET')] }, scopeSpans: [{ scope: { name: 'test', attributes: [attribute('gen_ai.input.messages', 'SCOPE_SECRET')] }, spans: [{
    traceId: 'A'.repeat(32), spanId: id, parentSpanId: 'c'.repeat(16), name: 'generation', flags: 1,
    startTimeUnixNano: '1700000000000000000', endTimeUnixNano: '1700000000001000000',
    attributes: [attribute('gen_ai.operation.name', 'chat'), attribute('openspanguard.cohort', 'demo'), attribute('gen_ai.usage.input_tokens', 7), attribute('gen_ai.usage.output_tokens', 3), ...(content ? [attribute('openspanguard.input', 'PROMPT_SECRET'), attribute('openspanguard.output', 'OUTPUT_SECRET'), attribute('openspanguard.context', 'CONTEXT_SECRET')] : [])],
    events: [{ name: 'gen_ai.user.message', attributes: [attribute('content', 'EVENT_SECRET')] }, { name: 'custom.safe', timeUnixNano: '1700000000001000000' }],
    customSafeField: 'preserved',
  }] }] }] };
}
type Batch = ReturnType<typeof batch>;
function firstSpan(value: Batch) { return value.resourceSpans[0]!.scopeSpans[0]!.spans[0]!; }
const post = (payload: unknown) => ({ method: 'POST', url: '/v1/traces', headers: { 'content-type': 'application/json' }, payload: JSON.stringify(payload) } as const);

async function collector(t: TestContext, handler: (body: unknown, request: IncomingMessage, response: ServerResponse) => void | Promise<void>) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    try { await handler(JSON.parse(Buffer.concat(chunks).toString()), request, response); }
    catch { response.statusCode = 500; response.end('{}'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address === 'object');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return `http://127.0.0.1:${address.port}/v1/traces`;
}

function gateway(t: TestContext, endpoint?: string, scorer: Scorer = { async evaluate() { return result; } }, extra: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({ OSG_DEMO_MODE: 'true', OSG_EVALUATOR: 'demo', ...(endpoint ? { OSG_OTLP_ENDPOINT: endpoint } : {}), ...extra });
  const app = buildServer(config, { scorer });
  t.after(async () => { await app.close(); });
  return app;
}

test('actual HTTP collector receives preserved identity, redacted content, quality attrs and synthetic compatibility events', async t => {
  let exported: Batch | undefined;
  let outboundAuth: string | undefined;
  const endpoint = await collector(t, (body, request, response) => { exported = body as Batch; outboundAuth = request.headers.authorization; response.end('{}'); });
  const app = gateway(t, endpoint, undefined, { OSG_API_KEY: 'a'.repeat(32), OSG_OTLP_AUTH: 'downstream-secret' });
  const request = post(batch());
  const response = await app.inject({ ...request, headers: { ...request.headers, authorization: `Bearer ${'a'.repeat(32)}` } });
  assert.equal(response.statusCode, 200); assert.deepEqual(response.json(), {});
  assert(exported); const span = firstSpan(exported);
  assert.equal(span.traceId, 'A'.repeat(32)); assert.equal(span.spanId, 'b'.repeat(16)); assert.equal(span.flags, 1);
  assert.equal(span.startTimeUnixNano, '1700000000000000000'); assert.equal(span.customSafeField, 'preserved');
  assert.equal(JSON.stringify(exported).includes('_SECRET'), false);
  assert.equal(outboundAuth, 'Bearer downstream-secret');
  const serialized = JSON.stringify(span);
  assert(serialized.includes('openspanguard.relevance.score')); assert(serialized.includes('test-synthetic'));
  assert.equal(span.events.filter(event => event.name === 'gen_ai.evaluation.result').length, 3);
  assert.equal(span.events.filter(event => event.name === 'custom.safe').length, 1);
  const metrics = await app.inject({ url: '/metrics', headers: { authorization: `Bearer ${'a'.repeat(32)}` } });
  assert.match(metrics.body, /openspanguard_quality_score_count\{cohort="demo"\} 1/);
  assert.match(metrics.body, /openspanguard_token_usage_total\{cohort="demo",type="input"\} 7/);
});

test('empty OTLP batches are accepted only after downstream acknowledgment', async t => {
  let exports = 0;
  const endpoint = await collector(t, (_body, _request, response) => { exports++; response.end('{}'); });
  const app = gateway(t, endpoint);
  for (const payload of [{}, { resourceSpans: [] }]) assert.equal((await app.inject(post(payload))).statusCode, 200);
  assert.equal(exports, 2);
});

test('inbound auth covers traces and metrics while liveness remains public', async t => {
  const app = gateway(t, undefined, undefined, { OSG_API_KEY: 'k'.repeat(32) });
  assert.equal((await app.inject(post(batch()))).statusCode, 401);
  assert.equal((await app.inject({ url: '/metrics' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/healthz' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/readyz' })).statusCode, 200);
  assert.equal((await app.inject({ ...post(batch()), headers: { 'content-type': 'application/json', authorization: `Bearer ${'k'.repeat(32)}` } })).statusCode, 200);
});

test('invalid JSON, malformed OTLP, protobuf, spans, structural depth and body size are rejected without content leakage', async t => {
  const app = gateway(t, undefined, undefined, { OSG_MAX_SPANS: '1', OSG_BODY_LIMIT: '4096', OSG_MAX_DEPTH: '12' });
  for (const payload of [null, [], { resourceSpans: 'bad' }, { resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: 'SECRET', spanId: 'bad' }] }] }] }]) {
    const response = await app.inject(post(payload)); assert.equal(response.statusCode, 400); assert(!response.body.includes('SECRET'));
  }
  assert.equal((await app.inject({ ...post({}), payload: '{broken SECRET' })).statusCode, 400);
  assert.equal((await app.inject({ ...post({}), headers: { 'content-type': 'application/x-protobuf' } })).statusCode, 415);
  assert.equal((await app.inject({ ...post({}), payload: '{"__proto__":{"secret":1}}' })).statusCode, 400);
  const tooMany = batch(); tooMany.resourceSpans[0]!.scopeSpans[0]!.spans.push(firstSpan(batch('d'.repeat(16))));
  assert.equal((await app.inject(post(tooMany))).statusCode, 400);
  let deep: unknown = {}; for (let i = 0; i < 20; i++) deep = { nested: deep };
  assert.equal((await app.inject(post(deep))).statusCode, 400);
  assert.equal((await app.inject(post({ value: 'SECRET'.repeat(1000) }))).statusCode, 413);
  assert.match((await app.inject('/metrics')).body, /openspanguard_inflight 0/);
});

test('repeated and concurrent OTLP deliveries evaluate and count tokens exactly once within local retention', async t => {
  let calls = 0; let exports = 0;
  const endpoint = await collector(t, (_body, _request, response) => { exports++; response.end('{}'); });
  const app = gateway(t, endpoint, { async evaluate() { calls++; await new Promise(resolve => setTimeout(resolve, 30)); return result; } });
  const responses = await Promise.all([app.inject(post(batch())), app.inject(post(batch())), app.inject(post(batch()))]);
  assert(responses.every(response => response.statusCode === 200));
  assert.equal((await app.inject(post(batch()))).statusCode, 200);
  assert.equal(calls, 1); assert.equal(exports, 4);
  const metrics = (await app.inject('/metrics')).body;
  assert.match(metrics, /openspanguard_evaluations_total\{cohort="demo",status="ok"\} 1/);
  assert.match(metrics, /openspanguard_spans_total\{cohort="demo"\} 1/);
  assert.match(metrics, /openspanguard_quality_score_count\{cohort="demo"\} 1/);
  assert.match(metrics, /openspanguard_token_usage_total\{cohort="demo",type="output"\} 3/);
  assert.match(metrics, /openspanguard_deduplicated_total 3/);
});

test('missing/oversized content and non-generation spans preserve coverage semantics', async t => {
  let calls = 0; const app = gateway(t, undefined, { async evaluate() { calls++; return result; } });
  await Promise.all([app.inject(post(batch(undefined, false))), app.inject(post(batch(undefined, false)))]);
  const oversized = batch('d'.repeat(16)); firstSpan(oversized).attributes.push(attribute('custom.safe', 'ok'));
  firstSpan(oversized).attributes.find(attr => attr.key === 'openspanguard.input')!.value = { stringValue: 'x'.repeat(32769) };
  assert.equal((await app.inject(post(oversized))).statusCode, 200);
  const retrieval = batch('e'.repeat(16)); firstSpan(retrieval).attributes.find(attr => attr.key === 'gen_ai.operation.name')!.value = { stringValue: 'retrieval' };
  assert.equal((await app.inject(post(retrieval))).statusCode, 200);
  assert.equal(calls, 0);
  const metrics = (await app.inject('/metrics')).body;
  assert.match(metrics, /openspanguard_spans_total\{cohort="demo"\} 2/);
  assert.match(metrics, /openspanguard_evaluations_total\{cohort="demo",status="skipped"\} 2/);
  assert.match(metrics, /openspanguard_deduplicated_total 1/);
  assert(!metrics.includes('openspanguard_quality_score_count{cohort="demo"}'));
});

test('scorer timeout/error are fail-open without scores or provider exception text', async t => {
  for (const mode of ['timeout', 'error'] as const) {
    let exported: Batch | undefined;
    const endpoint = await collector(t, (body, _request, response) => { exported = body as Batch; response.end('{}'); });
    const app = gateway(t, endpoint, { async evaluate() { if (mode === 'error') throw new Error('SECRET_REMOTE_TEXT'); return new Promise(() => {}); } }, { OSG_EVALUATION_TIMEOUT_MS: '20' });
    assert.equal((await app.inject(post(batch()))).statusCode, 200);
    assert(exported);
    const serialized = JSON.stringify(exported);
    assert(serialized.includes(`"stringValue":"${mode}"`));
    assert(!serialized.includes('openspanguard.relevance.score')); assert(!serialized.includes('SECRET_REMOTE_TEXT'));
  }
});

test('partialSuccess count is relayed while opaque collector error text is sanitized', async t => {
  const endpoint = await collector(t, (_body, _request, response) => { response.end(JSON.stringify({ partialSuccess: { rejectedSpans: '1', errorMessage: 'SECRET_INTERNAL_COLLECTOR' } })); });
  const response = await gateway(t, endpoint).inject(post(batch()));
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().partialSuccess.rejectedSpans, '1');
  assert(!response.body.includes('SECRET_INTERNAL_COLLECTOR'));
});

test('collector errors, redirects, invalid JSON and oversized replies return retryable 503 without leakage', async t => {
  for (const mode of ['error', 'redirect', 'json', 'oversized'] as const) {
    const endpoint = await collector(t, (_body, _request, response) => {
      if (mode === 'error') response.statusCode = 400;
      if (mode === 'redirect') { response.statusCode = 302; response.setHeader('location', 'https://example.invalid/SECRET'); }
      response.end(mode === 'json' ? 'SECRET_INVALID_JSON' : mode === 'oversized' ? 'S'.repeat(65537) : 'SECRET_RESPONSE');
    });
    const app = gateway(t, endpoint);
    const response = await app.inject(post(batch()));
    assert.equal(response.statusCode, 503); assert.equal(response.headers['retry-after'], '1'); assert(!response.body.includes('SECRET'));
    assert.match((await app.inject('/metrics')).body, /openspanguard_export_failures_total 1/);
  }
});

test('collector timeout is bounded and a retried delivery does not recount usage', async t => {
  let calls = 0;
  const endpoint = await collector(t, (_body, _request, response) => { calls++; if (calls > 1) response.end('{}'); });
  const app = gateway(t, endpoint, undefined, { OSG_EXPORT_TIMEOUT_MS: '30' });
  const started = performance.now();
  assert.equal((await app.inject(post(batch()))).statusCode, 503);
  assert(performance.now() - started < 1000);
  assert.equal((await app.inject(post(batch()))).statusCode, 200);
  assert.match((await app.inject('/metrics')).body, /openspanguard_token_usage_total\{cohort="demo",type="input"\} 7/);
});

test('active request capacity is bounded until downstream acknowledgment', async t => {
  let finish!: () => void; let accepted!: () => void;
  const ready = new Promise<void>(resolve => { accepted = resolve; });
  const endpoint = await collector(t, (_body, _request, response) => { finish = () => response.end('{}'); accepted(); });
  const app = gateway(t, endpoint, undefined, { OSG_MAX_INFLIGHT_REQUESTS: '1' });
  const first = app.inject(post(batch())); await ready;
  const second = await app.inject(post(batch('d'.repeat(16)))); assert.equal(second.statusCode, 503);
  assert.match((await app.inject('/metrics')).body, /openspanguard_inflight 1/);
  finish(); assert.equal((await first).statusCode, 200);
  assert.match((await app.inject('/metrics')).body, /openspanguard_inflight 0/);
});

test('unknown cohorts cannot become metric labels', async t => {
  const app = gateway(t); const payload = batch();
  firstSpan(payload).attributes.find(attr => attr.key === 'openspanguard.cohort')!.value = { stringValue: 'private-user-123' };
  await app.inject(post(payload)); const metrics = (await app.inject('/metrics')).body;
  assert(!metrics.includes('private-user-123')); assert.match(metrics, /openspanguard_spans_total\{cohort="default"\} 1/);
});

test('standard nested AnyValue messages fit the default depth bound and are evaluated in order', async t => {
  let evaluated: unknown;
  const app = gateway(t, undefined, { async evaluate(input) { evaluated = input; return result; } });
  const anyValue = (value: unknown): unknown => {
    if (typeof value === 'string') return { stringValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(anyValue) } };
    return { kvlistValue: { values: Object.entries(value as Record<string, unknown>).map(([key, value]) => ({ key, value: anyValue(value) })) } };
  };
  const payload = batch(undefined, false);
  const span = firstSpan(payload);
  const messages = (text: string) => anyValue([{ role: 'user', parts: [{ type: 'text', content: text }] }]);
  (span.attributes as unknown[]).push({ key: 'gen_ai.input.messages', value: messages('nested input') }, { key: 'gen_ai.output.messages', value: messages('nested output') });
  assert.equal((await app.inject(post(payload))).statusCode, 200);
  assert.deepEqual(evaluated, { prompt: 'nested input', response: 'nested output' });
});

test('disconnected clients retain inflight capacity until their downstream export finishes', async t => {
  let finish!: () => void; let accepted!: () => void;
  const ready = new Promise<void>(resolve => { accepted = resolve; });
  const endpoint = await collector(t, (_body, _request, response) => { finish = () => response.end('{}'); accepted(); });
  const app = gateway(t, endpoint, undefined, { OSG_MAX_INFLIGHT_REQUESTS: '1' });
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const controller = new AbortController();
  const first = fetch(`${base}/v1/traces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch()), signal: controller.signal });
  await ready; controller.abort(); await assert.rejects(first);
  assert.equal((await app.inject(post(batch('d'.repeat(16))))).statusCode, 503);
  assert.match((await app.inject('/metrics')).body, /openspanguard_inflight 1/);
  finish();
});

test('encoded route aliases enforce authentication and JSON content type on resolved routes', async t => {
  const app = gateway(t, undefined, undefined, { OSG_API_KEY: 'k'.repeat(32) });
  for (const url of ['/v1/%74races', '/%76%31/traces', '/v1/trac%65s']) {
    assert.equal((await app.inject({ ...post(batch()), url })).statusCode, 401);
    assert.equal((await app.inject({ ...post(batch()), url, headers: { 'content-type': 'application/x-protobuf', authorization: `Bearer ${'k'.repeat(32)}` } })).statusCode, 415);
    assert.equal((await app.inject({ ...post(batch()), url, headers: { 'content-type': 'application/json', authorization: `Bearer ${'k'.repeat(32)}` } })).statusCode, 200);
  }
  for (const url of ['/%6detrics', '/m%65trics']) {
    assert.equal((await app.inject({ url })).statusCode, 401);
    assert.equal((await app.inject({ url, headers: { authorization: `Bearer ${'k'.repeat(32)}` } })).statusCode, 200);
  }
});

test('encoded route aliases share the same active export capacity', async t => {
  let finish!: () => void; let accepted!: () => void;
  const ready = new Promise<void>(resolve => { accepted = resolve; });
  const endpoint = await collector(t, (_body, _request, response) => { finish = () => response.end('{}'); accepted(); });
  const app = gateway(t, endpoint, undefined, { OSG_MAX_INFLIGHT_REQUESTS: '1' });
  const first = app.inject({ ...post(batch()), url: '/v1/%74races' }); await ready;
  for (const url of ['/v1/traces', '/%76%31/traces', '/v1/trac%65s']) assert.equal((await app.inject({ ...post(batch('d'.repeat(16))), url })).statusCode, 503);
  finish(); assert.equal((await first).statusCode, 200);
});
