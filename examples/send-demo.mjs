import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const seconds = Number(process.argv[2] ?? 180);
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600) {
  throw new Error('Duration must be 10..3600 seconds');
}
// Search synthetic strings against the documented deterministic DemoScorer.
// These are fabricated signals, never an assessment of the text's quality.
function sample(low) {
  for (let index = 0; index < 10000; index++) {
    const input = { prompt: 'Synthetic traffic for a dashboard only.', response: `Synthetic answer ${index}.` };
    const score = createHash('sha256').update(JSON.stringify(input)).digest().readUInt16BE(0) / 65535;
    if (low ? score < 0.3 : score > 0.8) return input;
  }
  throw new Error('Could not find synthetic fixture');
}
const low = sample(true), high = sample(false);
let sent = 0;
for (let tick = 0; tick < seconds; tick++) {
  const now = BigInt(Date.now()) * 1_000_000n;
  const spans = ['demo', 'canary'].map(cohort => {
    const input = cohort === 'canary' ? low : high;
    return {
      traceId: randomBytes(16).toString('hex'), spanId: randomBytes(8).toString('hex'),
      name: 'chat synthetic-traffic', kind: 3,
      startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 1_000_000n).toString(),
      attributes: [
        { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
        { key: 'openspanguard.cohort', value: { stringValue: cohort } },
        { key: 'openspanguard.input', value: { stringValue: input.prompt } },
        { key: 'openspanguard.output', value: { stringValue: input.response } },
        { key: 'gen_ai.usage.input_tokens', value: { intValue: '8' } },
        { key: 'gen_ai.usage.output_tokens', value: { intValue: '5' } },
      ],
    };
  });
  const result = await fetch('http://127.0.0.1:4318/v1/traces', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resourceSpans: [{ resource: { attributes: [
      { key: 'service.name', value: { stringValue: 'openspanguard-synthetic-traffic' } },
    ] }, scopeSpans: [{ spans }] }] }),
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok) throw new Error(`Gateway returned ${result.status}`);
  await result.arrayBuffer();
  sent += spans.length;
  if (tick % 30 === 0) console.log(JSON.stringify({ synthetic: true, elapsedSeconds: tick, sent }));
  await sleep(1000);
}
console.log(JSON.stringify({ result: 'complete', synthetic: true, sent,
  note: 'Canary is deliberately low-scoring synthetic traffic. Check alert after the 2-minute hold.' }));
