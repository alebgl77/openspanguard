import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

export type Span = { traceId: string; spanId: string; name: string; startTimeUnixNano: string; endTimeUnixNano: string; attributes: { key: string; value: Record<string, unknown> }[]; events?: unknown[] };
export type Payload = { resourceSpans: { scopeSpans: { spans: Span[] }[] }[] };

export function fixture(id: number, withContent = true): Payload {
  const start = BigInt(Date.now()) * 1_000_000n;
  const span: Span = {
    traceId: id.toString(16).padStart(32, '0'),
    spanId: id.toString(16).padStart(16, '0'),
    name: 'chat synthetic-demo',
    startTimeUnixNano: start.toString(),
    endTimeUnixNano: (start + 1_000_000n).toString(),
    attributes: [
      { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
      { key: 'openspanguard.cohort', value: { stringValue: 'demo' } },
    ],
  };
  if (withContent) {
    span.attributes.push(
      { key: 'openspanguard.input', value: { stringValue: 'Synthetic private prompt: explain a trace.' } },
      { key: 'openspanguard.output', value: { stringValue: 'Synthetic private response: a trace records an operation.' } },
      { key: 'gen_ai.usage.input_tokens', value: { intValue: '8' } },
      { key: 'gen_ai.usage.output_tokens', value: { intValue: '12' } },
    );
  }
  return { resourceSpans: [{ scopeSpans: [{ spans: [span] }] }] };
}

export function spans(payload: Payload): Span[] {
  return payload.resourceSpans.flatMap(resource => resource.scopeSpans.flatMap(scope => scope.spans));
}

export function attributes(span: Span): Record<string, unknown> {
  return Object.fromEntries(span.attributes.map(attribute => [attribute.key, Object.values(attribute.value)[0]]));
}

export async function collector() {
  const received: Payload[] = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Payload);
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    } catch {
      response.writeHead(400).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/traces`;
  return { server, url, received };
}

export async function closeHttp(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
