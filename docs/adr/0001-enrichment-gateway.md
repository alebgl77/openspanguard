# ADR 0001: OTLP enrichment gateway

Status: accepted for developer preview. Date: 2026-09-27.

Completed SDK spans cannot be mutated in process, and content is unavailable without explicit capture. The system needs quality signals correlated with existing telemetry while keeping scoring off the synchronous generation path.

Decision: accept OTLP/HTTP JSON, evaluate eligible generation spans, enrich their exported representation while retaining IDs/timestamps, strip recognized content and forward to the existing collector. Publish bounded cohort metrics. Require explicit remote-content permission for Jev.

Use bounded in-memory concurrency, queue and identity caches. Expose unscored failures and downstream acceptance semantics. Defer distributed durability until operational demand is measured.

Alternatives considered: synchronous in-process scoring affects generation latency; HTTPS interception introduces privacy and semantic risks; separate evaluation traces weaken direct correlation; a durable distributed pipeline adds storage/coordination beyond this preview.

Consequences: export latency remains; content review is mandatory; TTL/restart/replica routing can repeat evaluation; collector acceptance is not durable storage. HTTP/protobuf and gRPC are unsupported. Evaluation span events are compatibility data, not standard standalone LogRecords. Future protocol or durability changes require a new ADR.
