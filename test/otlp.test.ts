import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluationInput, enrichSpan, isGeneration, redactBatch, spanKey, tokenUsage, validateBatch, type OtlpSpan } from '../src/otlp.js';
import { IdentityWindow } from '../src/telemetry.js';

const attr = (key: string, value: unknown) => ({ key, value: { stringValue: value } });
const span = (): OtlpSpan => ({ traceId: 'A'.repeat(32), spanId: 'B'.repeat(16), name: 'chat', attributes: [] });
const wrap = (value: OtlpSpan) => ({ resourceSpans: [{ scopeSpans: [{ spans: [value] }] }] });

test('OTLP structured and JSON-string message extraction preserves unicode and excludes image payloads', () => {
  const value = span();
  value.attributes = [
    attr('gen_ai.input.messages', JSON.stringify([{ role: 'user', parts: [{ type: 'text', text: 'Bonjour 🌍' }, { type: 'text', content: 'suite' }, { type: 'image', content: 'secret-image' }] }])),
    { key: 'gen_ai.output.messages', value: { arrayValue: { values: [{ kvlistValue: { values: [
      attr('role', 'assistant'), { key: 'parts', value: { arrayValue: { values: [{ kvlistValue: { values: [attr('type', 'text'), attr('content', 'Salut')] } }] } } },
    ] } }] } } },
  ];
  validateBatch(wrap(value), { maxSpans: 128, maxDepth: 30 });
  assert.deepEqual(evaluationInput(value), { prompt: 'Bonjour 🌍\nsuite', response: 'Salut' });
  assert.equal(spanKey(value), `${'a'.repeat(32)}:${'b'.repeat(16)}`);
});

test('generation classification excludes retrieval, embeddings and tool spans', () => {
  for (const operation of ['retrieval', 'embeddings', 'execute_tool', 'invoke_agent']) {
    const value = span(); value.attributes = [attr('gen_ai.operation.name', operation), attr('openspanguard.input', 'text')];
    assert.equal(isGeneration(value), false);
  }
  for (const operation of ['chat', 'generate_content', 'text_completion']) {
    const value = span(); value.attributes = [attr('gen_ai.operation.name', operation)]; assert.equal(isGeneration(value), true);
  }
  const metadataOnly = span(); metadataOnly.attributes = [attr('gen_ai.provider.name', 'provider')]; assert.equal(isGeneration(metadataOnly), false);
});

test('redaction reaches resources/scopes/links/content events, preserves metadata and unrelated evaluator events', () => {
  const value = span();
  value.attributes = [attr('openspanguard.input', 'sensitive'), attr('gen_ai.system_instructions', 'sensitive'), attr('http.request.header.authorization', 'sensitive'), attr('custom.safe', 'keep')];
  value.events = [{ name: 'gen_ai.user.message', body: 'sensitive' }, { name: 'gen_ai.evaluation.result', attributes: [attr('gen_ai.evaluation.name', 'external')] }];
  value.links = [{ attributes: [attr('api_key', 'sensitive')] }];
  const payload = { resourceSpans: [{ resource: { attributes: [attr('openspanguard.context', 'sensitive')] }, scopeSpans: [{ scope: { attributes: [attr('gen_ai.output.messages', 'sensitive')] }, spans: [value] }] }] };
  const result = { status: 'ok', relevanceScore: 0.5, confidence: 0.8, nonsenseProbability: 0.1, provider: 'demo', model: 'synthetic', rubricVersion: 'v1' } as const;
  enrichSpan(value, result); enrichSpan(value, result); redactBatch(payload);
  assert.equal(JSON.stringify(payload).includes('sensitive'), false);
  assert.equal(value.events.length, 4);
  assert.equal(value.events[0]?.name, 'gen_ai.evaluation.result');
  assert.equal(value.attributes.some(attribute => attribute.key === 'custom.safe'), true);
  enrichSpan(value, { status: 'error', reason: 'remote_error' });
  assert.equal(value.events.length, 1);
  assert.equal(value.attributes.some(attribute => attribute.key === 'openspanguard.relevance.score'), false);
});

test('OTLP guards reject identity, duplicate attributes, depth, strings and span count violations', () => {
  const limits = { maxSpans: 1, maxDepth: 20 };
  for (const change of [{ traceId: '0'.repeat(32) }, { traceId: 'x'.repeat(32) }, { spanId: 'short' }, { parentSpanId: '0'.repeat(16) }, { attributes: [attr('same', 'a'), attr('same', 'b')] }, { events: ['bad'] }]) {
    assert.throws(() => validateBatch(wrap({ ...span(), ...change } as OtlpSpan), limits));
  }
  assert.throws(() => validateBatch({ resourceSpans: [{ scopeSpans: [{ spans: [span(), span()] }] }] }, limits));
  assert.throws(() => validateBatch({ field: 'a'.repeat(262145) }, limits));
  assert.throws(() => validateBatch({ deep: { a: { b: { c: {} } } } }, { ...limits, maxDepth: 2 }));
  assert.deepEqual(validateBatch({}, limits), []);
  assert.deepEqual(validateBatch({ resourceSpans: [] }, limits), []);
});

test('tokens accept safe nonnegative OTLP int strings and reject invalid observations', () => {
  for (const invalid of ['-1', '1.5', 'Infinity', '1000000001', '9007199254740992']) {
    const value = span(); value.attributes = [{ key: 'gen_ai.usage.input_tokens', value: { intValue: invalid } }];
    assert.equal(tokenUsage(value, 'input'), undefined);
  }
  const value = span(); value.attributes = [{ key: 'gen_ai.usage.input_tokens', value: { intValue: '42' } }];
  assert.equal(tokenUsage(value, 'input'), 42);
});

test('identity cache is bounded by capacity and expires without retaining content', () => {
  let now = 0; const window = new IdentityWindow(2, 10, () => now);
  assert.equal(window.claim('a'), true); assert.equal(window.claim('a'), false);
  assert.equal(window.claim('b'), true); assert.equal(window.claim('c'), true);
  assert.equal(window.claim('a'), true);
  now = 11; assert.equal(window.claim('a'), true);
});

test('nested AnyValue credentials/content are removed while prompt template name/version survive at every level', () => {
  const nested = () => ({ key: 'custom.safe', value: { arrayValue: { values: [{ kvlistValue: { values: [
    attr('openspanguard.input', 'NESTED_SECRET'), attr('authorization', 'NESTED_SECRET'), attr('gen_ai.prompt', 'NESTED_SECRET'),
    attr('gen_ai.prompt.0.content', 'NESTED_SECRET'), attr('gen_ai.prompt.variable.question', 'NESTED_SECRET'),
    attr('gen_ai.prompt.name', 'support-template'), attr('gen_ai.prompt.version', 'v3'),
    { key: 'safe-nested', value: { kvlistValue: { values: [attr('api_key', 'NESTED_SECRET'), attr('gen_ai.prompt.name', 'inner-template')] } } },
  ] } }] } } });
  const value = span();
  value.attributes = [nested(), attr('gen_ai.prompt.name', 'outer-template'), attr('gen_ai.prompt.version', 'v2')];
  value.events = [{ name: 'custom.event', attributes: [nested()] }];
  value.links = [{ attributes: [nested()] }];
  const payload = { 'gen_ai.prompt.name': 'object-template', 'gen_ai.prompt.version': 'v1', resourceSpans: [{ resource: { attributes: [nested()] }, scopeSpans: [{ scope: { attributes: [nested()] }, spans: [value] }] }] };
  redactBatch(payload);
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes('NESTED_SECRET'));
  for (const retained of ['support-template', 'inner-template', 'outer-template', 'object-template', 'v1', 'v2', 'v3']) assert(serialized.includes(retained));
  assert.equal((serialized.match(/support-template/g) ?? []).length, 5);
});
