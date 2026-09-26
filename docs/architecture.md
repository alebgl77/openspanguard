# Architecture

An application's asynchronous SDK exports completed OTLP/HTTP JSON spans. OpenSpanGuard validates and bounds input, evaluates eligible generations, adds signals, strips recognized content, and forwards to an operator-configured collector. IDs and timestamps remain intact. The original ended SDK span is not modified. This is a telemetry gateway, not TLS interception or a generation-blocking policy.

A `traceId:spanId` identity shares an in-flight evaluation promise before slot acquisition. Matching retries reuse it; different content with the same live identity yields an identity conflict. The bounded cache retains digests/results, not prompt bodies. Failures may be cached until expiry, so immediate retry need not trigger evaluation again. The deadline includes queue wait and aborts timed-out provider work.

Spans with missing content still count toward coverage. Replayed spans still forward downstream; evaluation/sample/token counters count an identity once within the live cache. This reduces repeated scoring but offers no exactly-once guarantee after TTL, capacity eviction, restart or routing to another replica.

| Failure | Behavior |
| --- | --- |
| Missing/oversized content | Skipped without scores |
| Disabled scorer, saturation or provider timeout | Explicit unscored result; continue trace delivery |
| Malformed provider response | Bounded error reason; no invented score |
| Collector timeout/rejection | Export failure counter and retryable response |
| Collector partial success | Rejected-span count retained; message sanitized |
| Process restart | In-memory cache and queue state lost |

HTTP success means the downstream accepted the request, not durable storage. OpenSpanGuard has no disk queue. The demo collector retries using bounded memory-only queues. SDK retry policy, collector persistence and loss recovery remain operator responsibilities.

Bearer credentials are separate for inbound and outbound traffic. Spans cannot select egress destinations; endpoints are static configuration and redirects are disabled. Jev requires explicit remote-content opt-in. Incoming telemetry and process memory can contain raw content before redaction; unknown custom fields can retain it. Apply application-side minimization and the [production checklist](production-checklist.md).

Evaluation events are span-event compatibility data, not emitted standard LogRecords. See the pinned [semantic-convention scope](integration.md#compatibility).
