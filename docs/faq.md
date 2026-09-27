# Frequently asked questions

## What does OpenSpanGuard add?

It enriches completed AI generation spans on the OTLP export path and exposes cohort metrics. You can correlate relevance with the original trace and inspect how much of the observed traffic was actually evaluated. Start with the [local demo](../README.md#try-the-demo).

## Does it block a model response or change an ended span?

Evaluation occurs after a completed span is exported. A `BatchSpanProcessor` keeps it off the synchronous generation path; export, flushing and shutdown can still wait. The gateway enriches the exported OTLP copy. It does not modify the original ended SDK span or enforce a generation-time policy.

## Which transport and SDK can I use?

The receiver accepts OTLP/HTTP **JSON** on `/v1/traces`. Protobuf and gRPC are not supported. The included example uses `@opentelemetry/exporter-trace-otlp-http`; `-proto` is a different transport. Any instrumentation must supply supported generation attributes and explicit content. See [integration](integration.md).

## Is there an npm package or container registry image?

The preview is distributed as source. Clone it, run `npm ci` and `npm run build`, or let Docker Compose build the local image. The SDK helper is in `src/sdk.ts`, compiled to `dist/src/sdk.js`. Follow the repository commands rather than assuming a published npm or GHCR artifact.

## How do disabled, demo and Jev modes differ?

| Mode | Result | Requirements |
| --- | --- | --- |
| `disabled` (default) | Eligible evaluations are skipped | A downstream endpoint unless an explicit demo sink is used |
| `demo` | Deterministic synthetic scores | Explicit evaluator selection; Compose configures it for you |
| `jev` | Remote evaluator results | Jev key and `OSG_ALLOW_REMOTE_CONTENT=true` |

`OSG_DEMO_MODE` is a separate deployment escape hatch, not the evaluator selector. See [configuration](configuration.md). The offline demo makes no provider calls; Jev may incur charges.

## What content leaves my application?

Only explicitly captured content can be evaluated. Incoming telemetry and gateway memory can contain raw content. Jev receives evaluation input remotely before recognized fields are removed from onward traces. Redaction covers known attributes/events and supported nested locations; it does not discover all PII in arbitrary custom keys. Review application-side minimization, permissions and the [production checklist](production-checklist.md).

## What do the scores prove?

Relevance measures the configured rubric; confidence measures the evaluator's certainty in that decision. Neither proves factual correctness. The nonsense result answers a specific question and is not a general hallucination or safety probability. Synthetic demo scores validate plumbing, not model quality.

## How do I get real calibration?

Freeze provider/model and rubric versions, collect a representative permissioned dataset, and obtain independent domain labels. Evaluate ranking, precision/recall and calibration on held-out examples; inspect workload and language slices. Shadow alerts, review misses and false positives, then choose thresholds. Repeat when the model, rubric or instrumentation changes. [Measurement limits](measurement.md) explains the sample alert gates and benchmark scope.

## Why can coverage fall even when traces arrive?

Missing or oversized content, disabled evaluation, a full queue, provider errors and timeouts can all leave a delivered span unscored. Coverage uses successful first-observation evaluations over first-observed generation spans, with a bounded process-local metric identity window. A retry that later succeeds does not revise the recorded first outcome while that window still suppresses the identity. Export sampling may also bias that population. Check evaluation status alongside the score panels.

## Are retries evaluated exactly once?

An in-memory identity cache suppresses repeated evaluation within its limits. Retries still forward downstream. Cache expiry, capacity eviction, process restarts and different replicas can cause another evaluation. There is no global exactly-once guarantee or disk queue; collector acceptance does not establish durable storage.

## Is it a supported production platform or an official integration?

This is an independent **Developer Preview**, with best-effort community support. Validate a canary and implement your own operational controls before production. `gen_ai.evaluation.result` is a span-event compatibility representation, not an emitted standard OTel LogRecord. External projects and services are referenced for interoperability, without implied endorsement.

[Troubleshooting](troubleshooting.md) · [Support](../SUPPORT.md) · [Back to README](../README.md)
