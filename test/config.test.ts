import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('secure defaults require collector, remote auth and explicit remote content consent', () => {
  assert.throws(() => loadConfig({}), /OTLP_ENDPOINT/);
  const base = { OSG_OTLP_ENDPOINT: 'http://127.0.0.1:4319/v1/traces' };
  const config = loadConfig(base);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.evaluator, 'disabled');
  assert.equal(config.allowRemoteContent, false);
  assert.throws(() => loadConfig({ ...base, OSG_HOST: '0.0.0.0' }), /API_KEY/);
  assert.throws(() => loadConfig({ ...base, OSG_API_KEY: 'short' }), /32/);
  assert.equal(loadConfig({ ...base, OSG_HOST: '::', OSG_API_KEY: 'x'.repeat(32) }).host, '::');
  assert.throws(() => loadConfig({ ...base, OSG_EVALUATOR: 'jev', OSG_JEV_API_KEY: 'key' }), /ALLOW_REMOTE_CONTENT/);
  assert.equal(loadConfig({ ...base, OSG_EVALUATOR: 'jev', OSG_JEV_API_KEY: 'key', OSG_ALLOW_REMOTE_CONTENT: 'true' }).evaluator, 'jev');
  assert.equal(loadConfig({ OSG_DEMO_MODE: 'true', OSG_HOST: '0.0.0.0' }).otlpEndpoint, undefined);
});

test('configuration rejects URL credential leaks, ambiguous flags, labels and numeric overflow', () => {
  for (const override of [
    { OSG_OTLP_ENDPOINT: 'file:///v1/traces' }, { OSG_OTLP_ENDPOINT: 'http://user:pass@example.com/v1/traces' },
    { OSG_OTLP_ENDPOINT: 'http://example.com/v1/traces?token=secret' }, { OSG_OTLP_ENDPOINT: 'http://example.com/traces' },
    { OSG_JEV_ENDPOINT: 'http://example.com/v1/systemone' }, { OSG_PORT: '1.2' }, { OSG_CONCURRENCY: '0' },
    { OSG_MAX_QUEUE: '-1' }, { OSG_CACHE_SIZE: '100001' }, { OSG_EVALUATION_TIMEOUT_MS: 'Infinity' },
    { OSG_ALLOW_REMOTE_CONTENT: 'yes' }, { OSG_COHORTS: 'user-123' }, { OSG_COHORTS: 'default,default' },
    { OSG_OTLP_AUTH: 'a\r\nb' }, { OSG_API_KEY: '' }, { OSG_JEV_MODEL: 'bad\nmodel' },
  ]) assert.throws(() => loadConfig({ OSG_DEMO_MODE: 'true', ...override }));
});
