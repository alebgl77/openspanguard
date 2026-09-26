import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Span } from '@opentelemetry/api';
import { annotateGeneration, StreamAccumulator } from '../src/sdk.js';

test('SDK annotates current usage attributes before end with explicit content capture', () => {
  let recorded: Record<string, unknown> = {};
  const span = { setAttributes(value: Record<string, unknown>) { recorded = value; return this; } } as unknown as Span;
  const stream = new StreamAccumulator(); stream.push({ textDelta: 'héllo', usage: { inputTokens: 3, outputTokens: 2 } });
  const output = stream.finish();
  annotateGeneration(span, { prompt: 'question', response: output.text, context: 'evidence', cohort: 'demo', inputTokens: output.inputTokens!, outputTokens: output.outputTokens! });
  assert.equal(recorded['gen_ai.usage.input_tokens'], 3);
  assert.equal(recorded['gen_ai.operation.name'], 'chat');
  assert.equal(recorded['openspanguard.output'], 'héllo');
});

test('SDK validates every field before touching the span', () => {
  let calls = 0; const span = { setAttributes() { calls++; return this; } } as unknown as Span;
  for (const change of [{ prompt: 'x'.repeat(32769) }, { response: 'x'.repeat(32769) }, { context: 'x'.repeat(32769) }, { inputTokens: -1 }, { outputTokens: 0.5 }, { inputTokens: 1000000001 }, { cohort: 'person@example.com' }]) {
    assert.throws(() => annotateGeneration(span, { prompt: 'a', response: 'b', ...change }));
  }
  assert.equal(calls, 0);
});
