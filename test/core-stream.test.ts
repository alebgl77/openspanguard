import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamAccumulator, type StreamEvent } from '../src/core/stream.js';

test('same text is retained with different event IDs or no IDs; retries dedup only by ID', () => {
  const stream = new StreamAccumulator();
  stream.push({ textDelta: 'ha', eventId: '1' });
  stream.push({ textDelta: 'ha', eventId: '1' });
  stream.push({ textDelta: 'ha', eventId: '2' });
  stream.push({ textDelta: 'ha' });
  stream.push({ textDelta: 'ha' });
  assert.deepEqual(stream.finish(), { text: 'hahahaha' });
});

test('snapshots replace the transcript and subsequent deltas append', () => {
  const stream = new StreamAccumulator();
  stream.push({ textDelta: 'wrong initial' });
  stream.push({ textSnapshot: 'Hello' });
  stream.push({ textDelta: ' world' });
  stream.push({ textSnapshot: 'Final', textDelta: '!' });
  assert.equal(stream.finish().text, 'Final!');
});

test('cumulative and repeated usage is maximized independently, never summed', () => {
  const stream = new StreamAccumulator();
  stream.push({ usage: { inputTokens: 20, outputTokens: 1 }, eventId: 'a' });
  stream.push({ usage: { inputTokens: 20, outputTokens: 1 }, eventId: 'b' });
  stream.push({ usage: { inputTokens: 10, outputTokens: 5 }, eventId: 'c' });
  stream.push({ usage: { outputTokens: 4 }, eventId: 'd' });
  stream.push({ usage: { outputTokens: 100 }, eventId: 'd' });
  assert.deepEqual(stream.finish(), { text: '', inputTokens: 20, outputTokens: 5 });
  const zero = new StreamAccumulator();
  zero.push({ usage: { inputTokens: 0 } });
  assert.deepEqual(zero.finish(), { text: '', inputTokens: 0 });
});

test('UTF-8 decoded strings and split UTF-16 surrogate deltas concatenate without loss', () => {
  const stream = new StreamAccumulator();
  for (const textDelta of ['caf', 'é ', '\uD83D', '\uDE80', ' 世界']) stream.push({ textDelta });
  assert.equal(stream.finish().text, 'café 🚀 世界');
});

test('character limit is atomic and a failed event ID remains available', () => {
  const stream = new StreamAccumulator({ maxCharacters: 4 });
  stream.push({ textDelta: 'abc', usage: { outputTokens: 1 } });
  assert.throws(() => stream.push({ textDelta: 'de', eventId: 'retry', usage: { outputTokens: 9 } }), /stream_character_limit/);
  stream.push({ textDelta: 'd', eventId: 'retry' });
  assert.deepEqual(stream.finish(), { text: 'abcd', outputTokens: 1 });
});

test('event budget counts unique events including usage-only, with bounded duplicate storage', () => {
  const stream = new StreamAccumulator({ maxEvents: 2 });
  stream.push({ eventId: '1', textDelta: 'a' });
  stream.push({ eventId: '2', usage: { outputTokens: 1 } });
  stream.push({ eventId: '1', textDelta: 'ignored' });
  assert.throws(() => stream.push({ textDelta: 'b' }), /stream_event_limit/);
  assert.deepEqual(stream.finish(), { text: 'a', outputTokens: 1 });
});

test('finish is idempotent and immutable; all pushes after finishing throw', () => {
  const stream = new StreamAccumulator();
  stream.push({ eventId: 'a', textDelta: 'x' });
  const final = stream.finish();
  assert.equal(stream.finish(), final);
  assert(Object.isFrozen(final));
  assert.throws(() => stream.push({ eventId: 'a' }), /stream_finished/);
  assert.throws(() => stream.push({}), /stream_finished/);
});

test('invalid usage and event shapes never partially commit', () => {
  for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '3']) {
    const stream = new StreamAccumulator();
    assert.throws(() => stream.push({ textDelta: 'secret', usage: { inputTokens: value } } as StreamEvent), /invalid_stream_usage/);
    assert.deepEqual(stream.finish(), { text: '' });
  }
  const stream = new StreamAccumulator();
  for (const event of [null, { textDelta: 2 }, { eventId: 'x'.repeat(257) }, { usage: null }]) {
    assert.throws(() => stream.push(event as unknown as StreamEvent));
  }
  assert.deepEqual(stream.finish(), { text: '' });
});

test('invalid limits reject rather than create unbounded state', () => {
  for (const options of [{ maxEvents: 0 }, { maxEvents: Infinity }, { maxCharacters: -1 }, { maxCharacters: 1.2 }]) {
    assert.throws(() => new StreamAccumulator(options), /invalid_stream_limits/);
  }
});
