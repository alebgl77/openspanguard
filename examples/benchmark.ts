import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { arch, platform } from 'node:os';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { closeHttp, collector, fixture } from './support.js';

const count = Number(process.argv[2] ?? 200);
assert.ok(Number.isInteger(count) && count >= 10 && count <= 10_000, 'sample count must be 10..10000');
const downstream = await collector();
const app = buildServer(loadConfig({ OSG_EVALUATOR: 'demo', OSG_OTLP_ENDPOINT: downstream.url }));
const timings: number[] = [];
try {
  await app.ready();
  for (let index = 0; index < count + 20; index++) {
    const start = performance.now();
    const response = await app.inject({ method: 'POST', url: '/v1/traces', payload: fixture(index + 1) });
    assert.equal(response.statusCode, 200);
    if (index >= 20) timings.push(performance.now() - start);
  }
  timings.sort((left, right) => left - right);
  const percentile = (p: number) => Number(timings[Math.min(timings.length - 1, Math.ceil(p * timings.length) - 1)]!.toFixed(3));
  console.log(JSON.stringify({
    kind: 'synthetic-gateway-benchmark', evaluator: 'demo', liveJevCalls: 0,
    caveat: 'In-process HTTP injection plus loopback collector; not Jev latency, accuracy, or production capacity.',
    runtime: process.version, platform: platform(), arch: arch(),
    samples: count, warmupSamples: 20, concurrency: 1, spansPerRequest: 1,
    milliseconds: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: percentile(1) },
  }, null, 2));
} finally {
  await app.close();
  await closeHttp(downstream.server);
}
