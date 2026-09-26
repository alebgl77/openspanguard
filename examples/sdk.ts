import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { annotateGeneration } from '../src/sdk.js';
import { StreamAccumulator } from '../src/core/stream.js';

// Use this exporter in your existing provider; do not register a second global provider.
const provider = new BasicTracerProvider({
  spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? 'http://127.0.0.1:4318/v1/traces',
    headers: process.env.OSG_API_KEY ? { authorization: `Bearer ${process.env.OSG_API_KEY}` } : {},
  }))],
});
try {
  const span = provider.getTracer('example-agent').startSpan('chat example');
  span.setAttribute('gen_ai.operation.name', 'chat');
  const stream = new StreamAccumulator();
  for (const [index, textDelta] of ['A trace ', 'records an operation.'].entries()) {
    stream.push({ textDelta, eventId: String(index) });
  }
  const completed = stream.finish();
  // Explicit content capture happens before end(). Review data policy before using real content.
  annotateGeneration(span, { prompt: 'What is a trace?', response: completed.text, cohort: 'canary' });
  span.end();
  await provider.forceFlush();
  console.log('Synthetic example exported; inspect gateway metrics and your trace backend.');
} finally {
  await provider.shutdown();
}
