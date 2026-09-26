import { createHash, timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import { EvaluationEngine } from './core/engine.js';
import { DemoScorer, DisabledScorer, JevScorer } from './core/scorer.js';
import type { EvaluationResult, Scorer } from './core/types.js';
import { cohortFor, enrichSpan, evaluationInput, InvalidOtlpError, isGeneration, redactBatch, spanKey, tokenUsage, validateBatch } from './otlp.js';
import { IdentityWindow, Telemetry } from './telemetry.js';

export interface ServerDependencies { scorer?: Scorer; fetchImpl?: typeof fetch }

function authorized(header: string | undefined, apiKey: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(header ?? ''), digest(`Bearer ${apiKey}`));
}

async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return Buffer.concat(chunks).toString('utf8');
      bytes += chunk.value.byteLength;
      if (bytes > 65536) throw new Error('downstream_response_limit');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

/** Only the OTLP partial-success count is relayed; opaque collector text is never exposed. */
function collectorReply(body: string): Record<string, unknown> {
  if (!body.trim()) return {};
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_downstream_response');
  const partial = (value as Record<string, unknown>).partialSuccess;
  if (partial === undefined) return {};
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) throw new Error('invalid_downstream_response');
  const { rejectedSpans, errorMessage } = partial as Record<string, unknown>;
  if (rejectedSpans !== undefined && !(typeof rejectedSpans === 'string' && /^\d{1,20}$/.test(rejectedSpans)) && !(typeof rejectedSpans === 'number' && Number.isSafeInteger(rejectedSpans) && rejectedSpans >= 0)) throw new Error('invalid_downstream_response');
  return { partialSuccess: { ...(rejectedSpans !== undefined ? { rejectedSpans } : {}), ...(errorMessage ? { errorMessage: 'Downstream collector reported partial success' } : {}) } };
}

export function buildServer(config: Config, dependencies: ServerDependencies = {}): FastifyInstance {
  const scorer = dependencies.scorer ?? (config.evaluator === 'jev'
    ? new JevScorer({ apiKey: config.jevApiKey!, endpoint: config.jevEndpoint, model: config.jevModel })
    : config.evaluator === 'demo' ? new DemoScorer() : new DisabledScorer());
  const engine = new EvaluationEngine({ scorer, timeoutMs: config.evaluationTimeoutMs, concurrency: config.concurrency, maxQueue: config.maxQueue, cacheSize: config.cacheSize, cacheTtlMs: config.cacheTtlMs });
  const metrics = new Telemetry(config.cohorts);
  const identity = new IdentityWindow(config.cacheSize, config.cacheTtlMs);
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const app = Fastify({ logger: false, bodyLimit: config.bodyLimit, requestTimeout: 15000, connectionTimeout: 10000, keepAliveTimeout: 5000, onProtoPoisoning: 'error', onConstructorPoisoning: 'error' });
  const trackedRequests = new Set<string>();
  const runningRequests = new Set<string>();
  let active = 0;
  let closing = false;
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    if (config.apiKey && !authorized(request.headers.authorization, config.apiKey)) return reply.code(401).send({ error: 'unauthorized' });
  };
  // Route hooks apply after Fastify resolves encoded path aliases.
  const reserveRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    if (closing || active >= config.maxInflightRequests) return reply.code(503).header('retry-after', '1').send({ error: 'overloaded' });
    const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') return reply.code(415).send({ error: 'only_otlp_http_json_supported' });
    ++active;
    trackedRequests.add(request.id);
    metrics.inflight.set(active);
  };
  const release = (id: string) => { if (trackedRequests.delete(id)) { --active; metrics.inflight.set(active); } };
  app.addHook('onResponse', async request => { release(request.id); });
  app.addHook('onRequestAbort', async request => { if (!runningRequests.has(request.id)) release(request.id); });
  app.addHook('onTimeout', async request => { if (!runningRequests.has(request.id)) release(request.id); });
  app.addHook('onError', async request => { release(request.id); });
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof InvalidOtlpError ? 400 : (error as { statusCode?: number }).statusCode;
    if (status === 413) return reply.code(413).send({ error: 'payload_too_large' });
    if (status === 415) return reply.code(415).send({ error: 'only_otlp_http_json_supported' });
    if (status === 400) return reply.code(400).send({ error: 'invalid_otlp_payload' });
    return reply.code(500).send({ error: 'internal_error' });
  });
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => closing ? reply.code(503).send({ status: 'closing' }) : { status: 'ready' });
  app.get('/metrics', { onRequest: authenticate }, async (_request, reply) => reply.type(metrics.registry.contentType).send(await metrics.registry.metrics()));
  app.post('/v1/traces', { onRequest: [authenticate, reserveRequest] }, async (request, reply) => {
    runningRequests.add(request.id);
    try {
    const spans = validateBatch(request.body, config);
    await Promise.all(spans.filter(isGeneration).map(async span => {
      const key = spanKey(span);
      const first = identity.claim(key);
      const cohort = cohortFor(span, config.cohorts);
      const inputTokens = tokenUsage(span, 'input');
      const outputTokens = tokenUsage(span, 'output');
      if (!first) metrics.duplicates.inc();
      const started = performance.now();
      const input = evaluationInput(span);
      let result: EvaluationResult = { status: 'skipped', reason: 'missing_content' };
      if (input && (input.prompt.length > 32768 || input.response.length > 32768 || (input.context?.length ?? 0) > 32768)) {
        result = { status: 'skipped', reason: 'input_too_large' };
      } else if (input) {
        try { result = (await engine.evaluate(key, input)).result; }
        catch { result = { status: 'error', reason: 'evaluation_error' }; }
      }
      enrichSpan(span, result);
      if (first) metrics.record(cohort, result, (performance.now() - started) / 1000, inputTokens, outputTokens);
    }));
    redactBatch(request.body);
    if (!config.otlpEndpoint) return {};
    try {
      const response = await fetchImpl(config.otlpEndpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.exportTimeoutMs),
        headers: { 'content-type': 'application/json', ...(config.otlpAuth ? { authorization: `Bearer ${config.otlpAuth}` } : {}) },
        body: JSON.stringify(request.body),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('downstream_rejected'); }
      const result = collectorReply(await readBounded(response));
      return reply.code(200).send(result);
    } catch {
      metrics.exportFailures.inc();
      return reply.code(503).header('retry-after', '1').send({ error: 'downstream_unavailable' });
    }
    } finally { runningRequests.delete(request.id); release(request.id); }
  });
  app.addHook('preClose', async () => { closing = true; });
  app.addHook('onClose', async () => { await engine.close(); metrics.registry.clear(); });
  return app;
}
