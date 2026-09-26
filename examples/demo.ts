import assert from 'node:assert/strict';
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { buildServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { annotateGeneration } from '../src/sdk.js';
import { StreamAccumulator } from '../src/core/stream.js';
import { attributes, closeHttp, collector, fixture, spans } from './support.js';

const downstream = await collector();
const app = buildServer(loadConfig({
  OSG_EVALUATOR: 'demo',
  OSG_OTLP_ENDPOINT: downstream.url,
  OSG_COHORTS: 'default,demo,canary',
}));
let provider: BasicTracerProvider | undefined;
try {
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const original = fixture(1);
  const post = async (body: unknown) => {
    const response = await fetch(`${base}/v1/traces`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  };
  // Replay the exact original payload concurrently; evaluation counters count it once.
  await Promise.all([post(original), post(original)]);
  await post(fixture(2, false));

  const stream = new StreamAccumulator();
  stream.push({ textDelta: 'Hello ', eventId: 'chunk-1', usage: { inputTokens: 6, outputTokens: 1 } });
  stream.push({ textDelta: '🌍', eventId: 'chunk-2', usage: { inputTokens: 6, outputTokens: 2 } });
  stream.push({ textDelta: '🌍', eventId: 'chunk-2', usage: { inputTokens: 6, outputTokens: 2 } });
  const completed = stream.finish();
  assert.equal(completed.text, 'Hello 🌍');
  assert.equal(completed.outputTokens, 2);

  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${base}/v1/traces` }))],
  });
  const span = provider.getTracer('openspanguard-demo').startSpan('chat SDK-stream');
  span.setAttribute('gen_ai.operation.name', 'chat');
  const sdkIdentity = span.spanContext();
  annotateGeneration(span, {
    prompt: 'Synthetic private prompt: greet the world.',
    response: completed.text,
    cohort: 'demo',
    inputTokens: completed.inputTokens ?? 0,
    outputTokens: completed.outputTokens ?? 0,
  });
  span.end();
  await provider.forceFlush();

  const exported = downstream.received.flatMap(spans);
  assert.equal(exported.length, 4, 'all accepted exports, including replay, reach the collector');
  const replayed = exported.filter(item => item.traceId === '1'.padStart(32, '0'));
  assert.equal(replayed.length, 2);
  for (const copy of replayed) {
    assert.equal(copy.spanId, spans(original)[0]!.spanId);
    assert.equal(copy.startTimeUnixNano, spans(original)[0]!.startTimeUnixNano);
    assert.equal(copy.endTimeUnixNano, spans(original)[0]!.endTimeUnixNano);
    assert.equal(attributes(copy)['openspanguard.evaluation.status'], 'ok');
  }
  const skipped = exported.find(item => item.traceId === '2'.padStart(32, '0'))!;
  assert.equal(attributes(skipped)['openspanguard.evaluation.status'], 'skipped');
  assert.equal(attributes(skipped)['openspanguard.relevance.score'], undefined);
  const sdkExport = exported.find(item => item.spanId === sdkIdentity.spanId)!;
  assert.equal(sdkExport.traceId, sdkIdentity.traceId);
  assert.equal(attributes(sdkExport)['openspanguard.evaluation.status'], 'ok');
  const serialized = JSON.stringify(downstream.received);
  assert.ok(!serialized.includes('Synthetic private'));
  assert.ok(!serialized.includes('Hello 🌍'));
  assert.ok(!serialized.includes('openspanguard.input'));
  assert.ok(!serialized.includes('openspanguard.output'));
  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics, /openspanguard_deduplicated_total(?:\{[^}]*\})? 1/);
  assert.match(metrics, /openspanguard_evaluations_total\{[^}]*status="ok"[^}]*\} 2/);
  assert.match(metrics, /openspanguard_evaluations_total\{[^}]*status="skipped"[^}]*\} 1/);
  console.log(JSON.stringify({
    demo: 'synthetic-only', paidCalls: 0, outboundDestinations: ['loopback collector'],
    checks: ['original trace/span IDs and timestamps', 'concurrent replay deduplication',
      'scored and missing-content spans', 'content redaction', 'actual OTel HTTP/JSON exporter',
      'stream event and cumulative token handling'],
    uniqueSpans: 3, forwardedSpansIncludingReplay: exported.length, scoredSpans: 2,
    skippedSpans: 1, replayCount: 1, result: 'pass',
  }, null, 2));
} finally {
  await provider?.shutdown();
  await app.close();
  await closeHttp(downstream.server);
}
