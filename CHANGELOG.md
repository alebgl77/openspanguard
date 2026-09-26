# Changelog

## 0.1.0 — Developer preview

- OTLP/HTTP JSON gateway retaining original span identity.
- Bounded Jev, synthetic and disabled evaluators; explicit remote-content opt-in.
- Relevance, evaluator confidence, rubric-specific nonsense and explicit coverage.
- Recognized-content redaction, process-local replay suppression and cohort metrics.
- SDK/streaming examples, offline demo and synthetic overhead benchmark.
- Collector/Tempo/Prometheus/Grafana/Alertmanager demo stack and rule/CI checks.

Limits: JSON only; memory-only queues/cache; no distributed exactly-once guarantee, empirical Jev benchmark or production-readiness certification. Evaluation events are span-event compatibility data.
