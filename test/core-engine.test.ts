import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { EvaluationEngine } from '../src/core/engine.js';
import type { EvaluationInput, EvaluationResult, Scorer } from '../src/core/types.js';

const input = { prompt: 'private prompt', response: 'private response' };
const ok: EvaluationResult = {
  status: 'ok', relevanceScore: 0.75, confidence: 0.8, nonsenseProbability: 0.1,
  provider: 'test', model: 'test', rubricVersion: 'test-v1',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('simultaneous duplicate identities make one call; only original has reused=false', async () => {
  const gate = deferred<EvaluationResult>();
  let calls = 0;
  const engine = new EvaluationEngine({ scorer: { evaluate: async () => { calls++; return gate.promise; } } });
  const requests = Array.from({ length: 100 }, () => engine.evaluate('trace:span', input));
  await delay(0);
  assert.equal(calls, 1);
  gate.resolve(ok);
  const values = await Promise.all(requests);
  assert.equal(values.filter((value) => !value.reused).length, 1);
  assert.equal(values[0]?.reused, false);
  assert(values.every((value) => value.result === values[0]?.result));
  assert.equal((await engine.evaluate('trace:span', input)).reused, true);
  await engine.close();
});

test('live and cached IDs reject changed content, including changed context', async () => {
  const gate = deferred<EvaluationResult>();
  const engine = new EvaluationEngine({ scorer: { evaluate: async () => gate.promise } });
  const first = engine.evaluate('same', input);
  assert.deepEqual(await engine.evaluate('same', { ...input, response: 'changed' }), {
    result: { status: 'error', reason: 'identity_conflict' }, reused: true,
  });
  gate.resolve(ok);
  await first;
  assert.deepEqual(await engine.evaluate('same', { ...input, context: '' }), {
    result: { status: 'error', reason: 'identity_conflict' }, reused: true,
  });
  await engine.close();
});

test('admission copies caller input and cached result is immutable', async () => {
  const gate = deferred<EvaluationResult>();
  let observed: EvaluationInput | undefined;
  const engine = new EvaluationEngine({ concurrency: 1, scorer: { evaluate: async (value) => {
    if (value.prompt === 'block') return gate.promise;
    observed = value;
    return ok;
  } } });
  const first = engine.evaluate('first', { prompt: 'block', response: '' });
  const mutable = { ...input };
  const next = engine.evaluate('next', mutable);
  mutable.response = 'mutated';
  gate.resolve(ok);
  await first;
  const response = await next;
  assert.equal(observed?.response, input.response);
  assert(Object.isFrozen(response.result));
  assert.equal((await engine.evaluate('next', input)).reused, true);
  await engine.close();
});

test('expiry permits reevaluation and a different payload after TTL', async () => {
  let calls = 0;
  const engine = new EvaluationEngine({ cacheTtlMs: 15, scorer: { evaluate: async () => { calls++; return ok; } } });
  await engine.evaluate('a', input);
  assert.equal((await engine.evaluate('a', input)).reused, true);
  await delay(25);
  const fresh = await engine.evaluate('a', { ...input, response: 'new' });
  assert.equal(fresh.reused, false);
  assert.equal(calls, 2);
  await engine.close();
});

test('bounded cache evicts least recently used result; cache may be disabled', async () => {
  let calls = 0;
  const scorer: Scorer = { evaluate: async () => { calls++; return ok; } };
  const engine = new EvaluationEngine({ cacheSize: 2, scorer });
  await engine.evaluate('a', input);
  await engine.evaluate('b', input);
  await engine.evaluate('a', input);
  await engine.evaluate('c', input);
  assert.equal((await engine.evaluate('a', input)).reused, true);
  assert.equal((await engine.evaluate('b', input)).reused, false);
  assert.equal(calls, 4);
  await engine.close();
  const uncached = new EvaluationEngine({ cacheSize: 0, scorer });
  await uncached.evaluate('a', input);
  assert.equal((await uncached.evaluate('a', input)).reused, false);
  await uncached.close();
});

test('saturation is bounded and duplicate requests bypass slot admission', async () => {
  const gate = deferred<EvaluationResult>();
  const engine = new EvaluationEngine({ concurrency: 1, maxQueue: 1, scorer: { evaluate: async () => gate.promise } });
  const one = engine.evaluate('one', input);
  const two = engine.evaluate('two', input);
  const duplicate = engine.evaluate('two', input);
  assert.deepEqual(await engine.evaluate('three', input), {
    result: { status: 'skipped', reason: 'queue_full' }, reused: false,
  });
  gate.resolve(ok);
  await Promise.all([one, two]);
  assert.equal((await duplicate).reused, true);
  await engine.close();
});

test('timeout includes queue wait and abort-ignoring scorers cannot exceed concurrency', async () => {
  let calls = 0;
  let signal: AbortSignal | undefined;
  const engine = new EvaluationEngine({ timeoutMs: 25, concurrency: 1, maxQueue: 1, scorer: {
    evaluate: async (_input, incomingSignal) => { calls++; signal = incomingSignal; return new Promise(() => {}); },
  } });
  const one = engine.evaluate('one', input);
  const two = engine.evaluate('two', input);
  const results = await Promise.all([one, two]);
  assert(results.every((entry) => entry.result.status === 'timeout'));
  assert.equal(calls, 1);
  assert.equal(signal?.aborted, true);
  const next = engine.evaluate('three', input);
  assert.equal((await engine.evaluate('four', input)).result.status, 'skipped');
  assert.equal((await next).result.status, 'timeout');
  assert.equal(calls, 1);
  await engine.close();
});

test('queued work receives only the remaining deadline after active work ends', async () => {
  let secondSignal: AbortSignal | undefined;
  const engine = new EvaluationEngine({ timeoutMs: 80, concurrency: 1, scorer: { evaluate: async (value, signal) => {
    if (value.prompt === 'first') { await delay(55); return ok; }
    secondSignal = signal;
    return new Promise(() => {});
  } } });
  const start = performance.now();
  const first = engine.evaluate('one', { prompt: 'first', response: '' });
  const second = engine.evaluate('two', input);
  assert.equal((await first).result.status, 'ok');
  assert.equal((await second).result.status, 'timeout');
  assert.equal(secondSignal?.aborted, true);
  assert(performance.now() - start < 140, 'queue wait must not reset the timeout');
  await engine.close();
});

test('abort-cooperating timed out work releases the slot; late result cannot overwrite timeout', async () => {
  let calls = 0;
  const engine = new EvaluationEngine({ timeoutMs: 20, concurrency: 1, scorer: { evaluate: async (_input, signal) => {
    calls++;
    if (calls > 1) return ok;
    return new Promise((resolve) => signal.addEventListener('abort', () => resolve(ok), { once: true }));
  } } });
  assert.equal((await engine.evaluate('first', input)).result.status, 'timeout');
  await delay(0);
  assert.equal((await engine.evaluate('second', input)).result.status, 'ok');
  assert.equal((await engine.evaluate('first', input)).result.status, 'timeout');
  await engine.close();
});

test('exceptions become sanitized errors and errors are cached briefly', async () => {
  let calls = 0;
  const engine = new EvaluationEngine({ cacheTtlMs: 20, scorer: { evaluate: () => {
    calls++;
    throw new Error('secret prompt and API key');
  } } });
  assert.deepEqual((await engine.evaluate('a', input)).result, { status: 'error', reason: 'evaluation_failed' });
  assert.equal((await engine.evaluate('a', input)).reused, true);
  await delay(30);
  await engine.evaluate('a', input);
  assert.equal(calls, 2);
  await engine.close();
});

test('concurrency remains bounded under a large independent batch', async () => {
  let active = 0;
  let peak = 0;
  const engine = new EvaluationEngine({ concurrency: 3, maxQueue: 100, timeoutMs: 2_000, scorer: { evaluate: async () => {
    active++;
    peak = Math.max(active, peak);
    await delay(1);
    active--;
    return ok;
  } } });
  const results = await Promise.all(Array.from({ length: 80 }, (_, i) => engine.evaluate(`key-${i}`, input)));
  assert(results.every((result) => result.result.status === 'ok'));
  assert.equal(peak, 3);
  await engine.close();
});

test('close cancels active and queued work immediately, is idempotent, and rejects further admission', async () => {
  let signal: AbortSignal | undefined;
  const engine = new EvaluationEngine({ timeoutMs: 10_000, concurrency: 1, scorer: { evaluate: async (_input, value) => {
    signal = value;
    return new Promise(() => {});
  } } });
  const one = engine.evaluate('one', input);
  const two = engine.evaluate('two', input);
  await delay(0);
  await engine.close();
  await engine.close();
  assert.equal(signal?.aborted, true);
  for (const response of await Promise.all([one, two, engine.evaluate('three', input)])) {
    assert.deepEqual(response.result, { status: 'skipped', reason: 'engine_closed' });
  }
});

test('close before scorer microtask avoids invoking scorer at all', async () => {
  let calls = 0;
  const engine = new EvaluationEngine({ scorer: { evaluate: async () => { calls++; return ok; } } });
  const pending = engine.evaluate('a', input);
  await engine.close();
  assert.equal((await pending).result.status, 'skipped');
  assert.equal(calls, 0);
});

test('expired work never invokes scorer when its microtask runs before the overdue timer', async () => {
  let calls = 0;
  const engine = new EvaluationEngine({ timeoutMs: 5, scorer: { evaluate: async () => { calls++; return ok; } } });
  const pending = engine.evaluate('expired-before-call', input);
  // Synchronously block so the scorer microtask precedes the overdue timeout task.
  const until = performance.now() + 15;
  while (performance.now() < until) { /* intentional event-loop stall */ }
  assert.deepEqual((await pending).result, { status: 'timeout', reason: 'evaluation_timeout' });
  assert.equal(calls, 0);
  await engine.close();
});

test('rejection after deadline is a timeout even when the timeout callback has not run', async () => {
  let observedSignal: AbortSignal | undefined;
  const engine = new EvaluationEngine({ timeoutMs: 5, scorer: { evaluate: async (_input, signal) => {
    observedSignal = signal;
    const until = performance.now() + 15;
    while (performance.now() < until) { /* intentional event-loop stall */ }
    assert.equal(signal.aborted, false, 'the timer cannot fire during the synchronous stall');
    throw new Error('late private upstream failure');
  } } });
  assert.deepEqual((await engine.evaluate('late-failure', input)).result, { status: 'timeout', reason: 'evaluation_timeout' });
  assert.equal(observedSignal?.aborted, true);
  await engine.close();
});

test('invalid options and runtime inputs fail without calling scorer', async () => {
  const scorer: Scorer = { evaluate: async () => ok };
  for (const options of [{ concurrency: 0 }, { maxQueue: -1 }, { timeoutMs: NaN }, { cacheTtlMs: Infinity }, { cacheSize: 1.5 }]) {
    assert.throws(() => new EvaluationEngine({ scorer, ...options }), RangeError);
  }
  const engine = new EvaluationEngine({ scorer });
  assert.equal((await engine.evaluate('', input)).result.status, 'error');
  assert.equal((await engine.evaluate('a', { prompt: 3 } as unknown as EvaluationInput)).result.status, 'error');
  await engine.close();
});
