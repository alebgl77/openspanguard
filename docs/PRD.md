# Product brief

Teams already using OpenTelemetry and Prometheus need quality signals correlated with their original AI traces. Silent evaluator failures can make a quality average misleading. The first audience is the application/platform engineer who owns instrumentation, content policy and the existing telemetry pipeline.

The preview preserves original exported span identity, makes scoring coverage explicit, and exposes dedup-aware cohort alerts within documented process-local limits. It includes explicit content capture, a bounded Jev adapter, redaction, SDK/streaming helpers and a synthetic local stack.

[Langfuse](https://langfuse.com/docs) documents tracing, prompt management, production evaluation, datasets and experiments. [Phoenix](https://arize.com/docs/phoenix) documents OTLP tracing, span evaluation, prompts, datasets and experiments. Both already address AI observability; real-time evaluation alone is not a novel category claim.

OpenSpanGuard's narrower choice is an export-path component for teams retaining their collector/backend and Prometheus workflow. Original-span preservation, explicit coverage and bounded replay-aware metrics define its focus. This is positioning, not a measured claim that competitors lack equivalent integrations. No speed or accuracy superiority is claimed.

Acceptance: a clean checkout proves original IDs/timestamps, content stripping, missing-content coverage, replay behavior, actual SDK JSON export and stream aggregation without paid calls. Tests cover input bounds, auth, queues, failures and cancellation. Deployment includes traces, metrics, dashboard and a local alert route.

Excluded: HTTPS interception, automatic discovery of encrypted content, synchronous/per-token guardrails, prompt-management UI, distributed exactly-once evaluation, universal hallucination detection and production certification.

Canary success requires independent integration notes, explainable coverage gaps, restart/TTL/replica replay measurements, permissioned human labels, and actual overhead/loss/cost baselines. Adoption and quality targets follow those measurements.
