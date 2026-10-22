# Case study: offline OTLP/HTTP JSON validation

**Recorded 2026-10-22 · synthetic fixtures · local execution · Developer Preview**

The existing demo passed through a real OpenTelemetry HTTP/JSON exporter, the gateway and a loopback HTTP receiver. It preserved the asserted trace/span identities and timestamps, exposed missing-content evaluation, and removed recognized content from the forwarded fixtures. This is a reproducible integration case, with no customer dataset or live evaluator.

## Revision and environment

- Tested revision: [`a4c398738a5eff078e28fece0d21ce28416d4fb5`](https://github.com/alebgl77/openspanguard/commit/a4c398738a5eff078e28fece0d21ce28416d4fb5).
- Platform: Linux x64, Node.js **24.19.0**, npm **11.9.0**.
- Installation: `npm ci --ignore-scripts`, using the committed lockfile; 73 packages installed with registry access allowed. Offline here refers to execution after dependency installation. The checks and demo used synthetic or mocked evaluators and loopback services; no live provider key or Docker was used.
- Scenario sources: [demo](../../examples/demo.ts), [synthetic fixtures and receiver](../../examples/support.ts), [test suite](../../test/).

## Reproduce

From a checkout of the tested revision:

```sh
npm ci --ignore-scripts
npm run check:docs
npm run typecheck
npm test
npm run build
npm run demo
```

The host must allow local HTTP listeners and Node child processes. These commands were run on the environment above; this record does not establish results on other Node versions or operating systems.

| Command | Observed result |
| --- | --- |
| `npm run check:docs` | Exit 0; 25 documents, 135 local links and 8 assets checked at the tested revision |
| `npm run typecheck` | Exit 0 |
| `npm test` | 81 passed; 0 failed, cancelled or skipped |
| `npm run build` | Exit 0 |
| `npm run demo` | Exit 0; `"result": "pass"` |

The demo reported:

```json
{
  "demo": "synthetic-only",
  "paidCalls": 0,
  "outboundDestinations": ["loopback collector"],
  "checks": [
    "original trace/span IDs and timestamps",
    "concurrent replay deduplication",
    "scored and missing-content spans",
    "content redaction",
    "actual OTel HTTP/JSON exporter",
    "stream event and cumulative token handling"
  ],
  "uniqueSpans": 3,
  "forwardedSpansIncludingReplay": 4,
  "scoredSpans": 2,
  "skippedSpans": 1,
  "replayCount": 1,
  "result": "pass"
}
```

The replay reached the receiver twice while evaluation and metric counts were deduplicated locally. The missing-content span was forwarded with `skipped` status and no relevance score. The streaming fixture retained `Hello 🌍` with two cumulative output tokens despite a repeated chunk; the recognized prompt/response content was absent from the received payloads.

## A reproducibility issue found and fixed

At the preceding revision, `d00251b8de5d46e00d7ee33280d1080b025fc77c`, the demo failed with three received exports instead of four. The host inherited `OTEL_TRACES_SAMPLER=parentbased_traceidratio` and `OTEL_TRACES_SAMPLER_ARG=0.01`, so the SDK fixture could be sampled out. Setting `OTEL_TRACES_SAMPLER=always_on` made the unmodified demo pass and isolated the cause.

The tested revision gives the demo's local provider an explicit `AlwaysOnSampler`. Its export-count assertion remains intact; the gateway runtime and application sampling policies are unchanged. The existing demo also passed this regression check in a POSIX shell:

```sh
OTEL_TRACES_SAMPLER=always_off npm run demo
```

## What remains unmeasured

All scores come from a deterministic synthetic scorer; they do not establish answer quality, Jev accuracy or calibration. The receiver is the demo's in-memory HTTP service, so this run does not validate Docker, an OpenTelemetry Collector deployment, Tempo persistence, Grafana or alert delivery. No latency, throughput, availability, cost saving or customer ROI result is claimed.

The transport exercised is **OTLP/HTTP JSON**. Protobuf and gRPC support are outside this preview. Replay suppression is bounded and process-local; the observed replay behavior is not a distributed exactly-once guarantee. Redaction assertions cover recognized fixture fields, not arbitrary sensitive content. See [measurement limits](../measurement.md) and the [production checklist](../production-checklist.md) for the workload-specific validation still required.
