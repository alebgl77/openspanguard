import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
}
async function eventually(label, check, attempts = 90) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { if (await check()) return; } catch { /* Startup/transient failures are retried. */ }
    await sleep(1000);
  }
  throw new Error(`Timed out: ${label}`);
}
for (const [name, url] of [
  ['gateway', 'http://127.0.0.1:4318/healthz'],
  ['collector', 'http://127.0.0.1:13133/'],
  ['tempo', 'http://127.0.0.1:3200/ready'],
  ['prometheus', 'http://127.0.0.1:9090/-/ready'],
  ['grafana', 'http://127.0.0.1:3000/api/health'],
  ['alertmanager', 'http://127.0.0.1:9093/-/ready'],
  ['webhook', 'http://127.0.0.1:9080/healthz'],
]) await eventually(name, async () => (await request(url)).ok);

const traceId = randomBytes(16).toString('hex');
const spanId = randomBytes(8).toString('hex');
const start = BigInt(Date.now()) * 1_000_000n;
const payload = {
  resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'openspanguard-synthetic-smoke' } }] },
    scopeSpans: [{ scope: { name: 'synthetic-smoke' }, spans: [{
      traceId, spanId, name: 'chat synthetic-smoke', kind: 3,
      startTimeUnixNano: start.toString(), endTimeUnixNano: (start + 1_000_000n).toString(),
      attributes: [
        { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
        { key: 'openspanguard.cohort', value: { stringValue: 'demo' } },
        { key: 'openspanguard.input', value: { stringValue: 'synthetic-private-smoke-prompt' } },
        { key: 'openspanguard.output', value: { stringValue: 'synthetic-private-smoke-response' } },
      ],
    }] }],
  }],
};
const response = await request('http://127.0.0.1:4318/v1/traces', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
});
assert.equal(response.status, 200, 'gateway accepts JSON');
await response.arrayBuffer();
const metrics = await (await request('http://127.0.0.1:4318/metrics')).text();
assert.match(metrics, /openspanguard_evaluations_total\{[^}]*cohort="demo"[^}]*status="ok"[^}]*\} [1-9]/);
await eventually('trace in Tempo', async () => {
  const result = await request(`http://127.0.0.1:3200/api/traces/${traceId}`, { headers: { accept: 'application/json' } });
  if (!result.ok) return false;
  const serialized = JSON.stringify(await result.json());
  assert.ok(serialized.includes(spanId) || serialized.includes(Buffer.from(spanId, 'hex').toString('base64')));
  assert.ok(serialized.includes('openspanguard.relevance.score'));
  assert.ok(!serialized.includes('synthetic-private-smoke'));
  return true;
});
await eventually('Prometheus scraped gateway', async () => {
  const result = await (await request('http://127.0.0.1:9090/api/v1/query?query=' +
    encodeURIComponent('sum(openspanguard_evaluations_total{cohort="demo",status="ok"})'))).json();
  return Number(result.data?.result?.[0]?.value?.[1]) >= 1;
});
const dashboard = await request('http://127.0.0.1:3000/api/dashboards/uid/openspanguard');
assert.equal(dashboard.status, 200, 'provisioned Grafana dashboard exists');
const alert = await request('http://127.0.0.1:9093/api/v2/alerts', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify([{
    labels: { alertname: 'OpenSpanGuardSmoke', severity: 'info', cohort: 'demo' },
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 120_000).toISOString(),
    annotations: { summary: 'Synthetic local delivery check' },
  }]),
});
assert.equal(alert.status, 200);
await eventually('Alertmanager local webhook routing', async () => {
  const state = await (await request('http://127.0.0.1:9080/healthz')).json();
  return state.recent?.some(item => item.alertname === 'OpenSpanGuardSmoke' && item.status === 'firing');
});
console.log(JSON.stringify({
  result: 'pass', synthetic: true, traceId, spanId,
  checks: ['gateway', 'collector', 'Tempo identity and redaction', 'Prometheus scrape',
    'Grafana dashboard', 'Alertmanager to local webhook'],
}, null, 2));
