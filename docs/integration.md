# Integration

Run `npm ci`, start a gateway and execute `npx tsx examples/sdk.ts`. The preview runs from source; no npm package or registry image is implied.

For an existing application, configure `OTLPTraceExporter` from `@opentelemetry/exporter-trace-otlp-http` in its existing provider's `BatchSpanProcessor`. Set the full gateway URL and an `authorization: Bearer …` header from your secret manager when required. Do not register a second global provider. See [examples/sdk.ts](../examples/sdk.ts). That example accepts `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and `OSG_API_KEY`.

Batch export keeps scoring off the synchronous generation path; flush/shutdown, short-lived functions, exporter queues and memory pressure can still affect the application. Flush at lifecycle boundaries, not after each token.

## Content and streaming

Call `annotateGeneration(span, { prompt, response, context?, cohort?, inputTokens?, outputTokens? })` before `span.end()`. It explicitly captures content under `openspanguard.input/output/context`. Each content field is limited to 32,768 UTF-16 code units. Set an appropriate operation such as `gen_ai.operation.name=chat`; supported generation operations also include `generate_content` and `text_completion`.

Supported standard message fields can be JSON strings or structured OTLP array/kvlist values. A model name and token counts alone do not supply evaluation content. Missing or oversized content yields a skipped evaluation.

`StreamAccumulator` appends deltas, replaces text on snapshots, ignores duplicate event IDs and retains repeated text from distinct events. Usage is a cumulative maximum, not a sum. Finish is idempotent; pushes after finish or content/event limit overflow throw. Handle instrumentation errors so they do not interrupt user output. Evaluation occurs after the completed span is exported.

Recognized input/output/context attributes and content events are stripped before onward export, including supported scope/resource locations. Arbitrary sensitive values under unrelated custom keys may remain. This is not automatic PII discovery; minimize content at the application.

## Jev in PowerShell

Start the local collector/Tempo and build as described in the README. Supply the key without including it in command history:

```powershell
$jevSecret = Read-Host 'Jev API key' -AsSecureString
$env:OSG_JEV_API_KEY = [System.Net.NetworkCredential]::new('', $jevSecret).Password
$env:OSG_EVALUATOR = 'jev'
$env:OSG_ALLOW_REMOTE_CONTENT = 'true'
$env:OSG_OTLP_ENDPOINT = 'http://127.0.0.1:4319/v1/traces'
npm start
```

Use managed secret injection for deployed services. Live Jev evaluation sends captured content remotely and may incur charges. Jev's hosted model/service is not included in this repository's Apache-2.0 code license.

## Compatibility

Original IDs, parent relationships and timestamps remain in exported OTLP. Successful evaluation adds status, provider/model/rubric metadata, relevance, confidence and nonsense fields; failures never fabricate score fields.

`gen_ai.evaluation.result` is a **span event compatibility representation** with `gen_ai.evaluation.name` and `gen_ai.evaluation.score.value`. It is not a standalone OTel LogRecord. The development-convention reference is [GenAI semantic conventions at e57c543, 2026-09-24](https://github.com/open-telemetry/semantic-conventions-genai/tree/e57c543b4889619eb2a05702471937db5119165d/docs/gen-ai). Compatibility is scoped to this preview and does not assert official affiliation or perpetual conformance.
