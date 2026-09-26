# Production checklist

This developer preview requires controlled canary validation. Record an owner and evidence for each item before expanding traffic.

- **Content:** authorize captured prompts, outputs and contexts; minimize PII/secrets before export; review provider retention. Live evaluation is explicit opt-in.
- **Secrets:** inject and rotate inbound, evaluator and collector credentials separately; never commit them.
- **Network:** disable demo mode; use authenticated TLS/mTLS ingress, network policy and restricted metric scraping. A public listener does not provide TLS.
- **Redaction:** use sensitive synthetic sentinels to inspect actual attributes, resources, scopes, events and downstream storage. Unknown keys are not guaranteed sanitized.
- **Capacity:** load-test realistic body sizes, queue/concurrency limits, timeouts, memory and provider latency; set container limits from measurement. Exercise saturation and cancellation.
- **Replicas:** caches are process-local. Stable trace/span routing may reduce cross-replica repeated scoring but does not provide exactly-once delivery. Test TTL, eviction, rolling deploys, pod loss and duplicate billing.
- **Delivery:** the gateway has no disk queue; the demo collector queue is memory-only. Configure SDK backoff and collector persistent queues if required. Prove outage recovery and quantify telemetry loss.
- **Storage:** replace Tempo tmpfs with durable managed storage; define backend/metric retention, access controls, backups and deletion. Prometheus demo retention is 24 hours.
- **Calibration:** shadow quality alerts, review human-labeled disagreement, monitor sample counts and coverage, and revalidate after model/rubric changes.
- **Health:** alert on export failures, saturation and timeouts as well as quality. Process readiness does not prove provider or backend readiness.
- **Supply chain:** review dependency/image advisories and updates; record artifact digests/SBOM in your release process.
- **Rollout:** start with a capped canary cohort, bound provider spend externally, compare telemetry loss with baseline and rehearse rollback to direct collector export.

Synthetic tests and CI do not establish production readiness or evaluator accuracy.
