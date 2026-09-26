import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { DemoScorer, DisabledScorer, JevScorer, JEV_RUBRIC_VERSION } from '../src/core/scorer.js';
import { EvaluationEngine } from '../src/core/engine.js';
import type { EvaluationInput } from '../src/core/types.js';

const input: EvaluationInput = { prompt: 'Private prompt', response: 'Private response', context: 'Evidence' };
const signal = () => new AbortController().signal;
function valid() {
  return {
    model: 'jev-example',
    answers: {
      relevance: {
        type: 'score', score: 3.5, confidence: 0.8,
        probabilities: { '0': 0, '1': 0, '2': 0, '3': 0.5, '4': 0.5 },
        legend: { '0': 'Unrelated', '1': 'Topic only', '2': 'Partial', '3': 'Mostly complete', '4': 'Complete' },
      },
      nonsense: { type: 'noul', noul: 0.125 },
    },
    usage: { input_tokens: 50, output_tokens: 25 },
  };
}
function mock(response: Response | (() => Response)): typeof fetch {
  return (async () => typeof response === 'function' ? response() : response) as typeof fetch;
}
function scorerFor(value: unknown): JevScorer {
  return new JevScorer({ apiKey: 'test-key', fetchImpl: mock(Response.json(value)) });
}

test('official HTTP contract: endpoint, bearer auth, score/noul questions, normalization and metadata', async () => {
  let called = 0;
  const scorer = new JevScorer({ apiKey: 'test-key', fetchImpl: (async (url, init) => {
    called++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-key');
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, 'jev-latest');
    assert.deepEqual(body.state, input);
    assert.deepEqual(Object.keys(body.questions), ['relevance', 'nonsense']);
    assert.equal(body.questions.relevance.type, 'score');
    assert.equal(body.questions.relevance.criteria.length, 5);
    assert(body.questions.relevance.criteria.every((level: unknown) => typeof level === 'string' && level.length > 40));
    assert.equal(body.questions.nonsense.type, 'noul');
    assert.match(body.questions.nonsense.instructions, /not factual correctness or hallucination/);
    assert(init?.signal instanceof AbortSignal);
    return Response.json(valid());
  }) as typeof fetch });
  assert.deepEqual(await scorer.evaluate(input, signal()), {
    status: 'ok', relevanceScore: 0.875, confidence: 0.8, nonsenseProbability: 0.125,
    provider: 'typesafe', model: 'jev-example', rubricVersion: JEV_RUBRIC_VERSION,
  });
  assert.equal(called, 1);
});

test('state omits absent context and honors configured model and endpoint', async () => {
  const scorer = new JevScorer({ apiKey: 'k', endpoint: 'http://127.0.0.1:9090/evaluate', model: 'custom-model',
    fetchImpl: (async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:9090/evaluate');
      const body = JSON.parse(init?.body as string);
      assert.equal(body.model, 'custom-model');
      assert.deepEqual(body.state, { prompt: '', response: '' });
      return Response.json(valid());
    }) as typeof fetch,
  });
  assert.equal((await scorer.evaluate({ prompt: '', response: '' }, signal())).status, 'ok');
});

test('zero and maximum scores are valid; fractional weighted scores stay fractional', async () => {
  for (const score of [0, 4]) {
    const value = valid();
    value.answers.relevance.score = score;
    value.answers.relevance.probabilities = { '0': score === 0 ? 1 : 0, '1': 0, '2': 0, '3': 0, '4': score === 4 ? 1 : 0 };
    value.answers.nonsense.noul = score / 4;
    const result = await scorerFor(value).evaluate(input, signal());
    assert.equal(result.status, 'ok');
    if (result.status === 'ok') assert.equal(result.relevanceScore, score / 4);
  }
});

test('invalid numeric answers, types, probability distribution and legend fail closed', async (t) => {
  const mutations: Array<[string, (value: ReturnType<typeof valid>) => void]> = [
    ['negative score', (v) => { v.answers.relevance.score = -1; }],
    ['score above max', (v) => { v.answers.relevance.score = 5; }],
    ['NaN score', (v) => { v.answers.relevance.score = NaN; }],
    ['infinite confidence', (v) => { v.answers.relevance.confidence = Infinity; }],
    ['negative confidence', (v) => { v.answers.relevance.confidence = -0.1; }],
    ['large noul', (v) => { v.answers.nonsense.noul = 1.1; }],
    ['string score', (v) => { (v.answers.relevance as Record<string, unknown>).score = '3.5'; }],
    ['wrong score type', (v) => { v.answers.relevance.type = 'noul'; }],
    ['wrong noul type', (v) => { v.answers.nonsense.type = 'score'; }],
    ['probability mass missing', (v) => { v.answers.relevance.probabilities['4'] = 0; }],
    ['negative probability', (v) => { v.answers.relevance.probabilities['0'] = -1; }],
    ['inconsistent score', (v) => { v.answers.relevance.score = 1; }],
    ['extra probability level', (v) => { (v.answers.relevance.probabilities as Record<string, number>)['5'] = 0; }],
    ['missing probability level', (v) => { delete (v.answers.relevance.probabilities as Record<string, number>)['0']; }],
    ['empty legend label', (v) => { v.answers.relevance.legend['0'] = ''; }],
    ['missing legend level', (v) => { delete (v.answers.relevance.legend as Record<string, string>)['0']; }],
    ['raw model text', (v) => { v.model = 'private response should never appear'; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, async () => {
      const value = valid();
      mutate(value);
      assert.deepEqual(await scorerFor(value).evaluate(input, signal()), { status: 'error', reason: 'jev_invalid_response' });
    });
  }
  for (const value of [null, [], {}, { answers: {} }, { ...valid(), answers: { relevance: [] } }]) {
    assert.equal((await scorerFor(value).evaluate(input, signal())).status, 'error');
  }
});

test('upstream errors and invalid JSON never expose response bodies or network error details', async () => {
  const cases: Array<[typeof fetch, string]> = [
    [mock(new Response('secret upstream body', { status: 429 })), 'jev_http_error'],
    [mock(new Response('secret not json', { headers: { 'content-type': 'application/json' } })), 'jev_invalid_response'],
    [mock(new Response('<html>secret</html>', { headers: { 'content-type': 'text/html' } })), 'jev_invalid_response'],
    [(async () => { throw new Error('secret token https://secret'); }) as typeof fetch, 'jev_unavailable'],
  ];
  for (const [fetchImpl, reason] of cases) {
    assert.deepEqual(await new JevScorer({ apiKey: 'k', fetchImpl }).evaluate(input, signal()), { status: 'error', reason });
  }
});

test('body limit rejects declared oversized bodies and streamed bodies without trusting Content-Length', async () => {
  for (const headers of [{ 'content-type': 'application/json', 'content-length': '70000' }, { 'content-type': 'application/json' }, { 'content-type': 'application/json', 'content-length': '1' }]) {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65_537)); },
      cancel() { canceled = true; },
    });
    const scorer = new JevScorer({ apiKey: 'k', fetchImpl: mock(new Response(body, { headers })) });
    assert.deepEqual(await scorer.evaluate(input, signal()), { status: 'error', reason: 'jev_response_too_large' });
    assert.equal(canceled, true);
  }
});

test('pre-aborted signal never sends remote content', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const scorer = new JevScorer({ apiKey: 'k', fetchImpl: (async () => { calls++; return Response.json(valid()); }) as typeof fetch });
  assert.deepEqual(await scorer.evaluate(input, controller.signal), { status: 'timeout', reason: 'evaluation_timeout' });
  assert.equal(calls, 0);
});

test('abort during response body reading cancels stream and returns timeout', async () => {
  const controller = new AbortController();
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { canceled = true; } });
  const scorer = new JevScorer({ apiKey: 'k', fetchImpl: mock(new Response(body, { headers: { 'content-type': 'application/json' } })) });
  const evaluation = scorer.evaluate(input, controller.signal);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  assert.deepEqual(await evaluation, { status: 'timeout', reason: 'evaluation_timeout' });
  assert.equal(canceled, true);
});

test('real native fetch reaches local HTTP service and redirects never resend credentials', async () => {
  let evaluated = 0;
  let redirectTarget = 0;
  const server = createServer(async (request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/stolen' }).end();
      return;
    }
    if (request.url === '/stolen') redirectTarget++;
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()).state, input);
    evaluated++;
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(valid()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const scorer = new JevScorer({ apiKey: 'test-key', endpoint: `${endpoint}/score` });
    assert.equal((await scorer.evaluate(input, signal())).status, 'ok');
    const redirected = new JevScorer({ apiKey: 'test-key', endpoint: `${endpoint}/redirect` });
    assert.equal((await redirected.evaluate(input, signal())).status, 'error');
    assert.equal(evaluated, 1);
    assert.equal(redirectTarget, 0);
  } finally {
    const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  }
});

test('unsafe credentials, endpoints and model values are rejected before remote calls', () => {
  for (const apiKey of ['', ' ', 'a\nb', 'a\tb', 'a'.repeat(4_097)]) {
    assert.throws(() => new JevScorer({ apiKey }), /invalid_jev_api_key/);
  }
  for (const endpoint of ['ftp://host/path', 'http://external.example/path', 'https://user:pass@example.com/', 'https://example.com/#fragment', 'https://example.com/?secret=1']) {
    assert.throws(() => new JevScorer({ apiKey: 'k', endpoint }), /invalid_jev_endpoint/);
  }
  assert.throws(() => new JevScorer({ apiKey: 'k', model: 'model\nsecret' }), /invalid_jev_model/);
  assert.doesNotThrow(() => new JevScorer({ apiKey: 'k', endpoint: 'http://[::1]:9090/score' }));
});

test('direct scorer and engine inputs bound each content field before hashing or sending', async () => {
  let calls = 0;
  const scorer = new JevScorer({ apiKey: 'k', fetchImpl: (async () => { calls++; return Response.json(valid()); }) as typeof fetch });
  const engine = new EvaluationEngine({ scorer });
  for (const field of ['prompt', 'response', 'context']) {
    const oversized = { ...input, [field]: 'x'.repeat(32_769) };
    assert.deepEqual(await scorer.evaluate(oversized, signal()), { status: 'error', reason: 'invalid_input' });
    assert.deepEqual((await engine.evaluate(field, oversized)).result, { status: 'error', reason: 'invalid_input' });
  }
  assert.equal(calls, 0);
  assert.equal((await scorer.evaluate({ prompt: 'x'.repeat(32_768), response: '' }, signal())).status, 'ok');
  await engine.close();
});

test('demo values are deterministic, bounded and explicitly synthetic; disabled never reports scores', async () => {
  const demo = new DemoScorer();
  const first = await demo.evaluate(input, signal());
  assert.deepEqual(await demo.evaluate(input, signal()), first);
  assert.equal(first.status, 'ok');
  if (first.status === 'ok') {
    assert.equal(first.provider, 'synthetic');
    assert.equal(first.model, 'deterministic-demo');
    for (const value of [first.relevanceScore, first.confidence, first.nonsenseProbability]) assert(value >= 0 && value <= 1);
  }
  assert.deepEqual(await new DisabledScorer().evaluate(input, signal()), { status: 'skipped', reason: 'evaluator_disabled' });
});
