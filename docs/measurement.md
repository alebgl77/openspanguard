# Measurement limits

The [Jev score primitive](https://docs.typesafe.ai/primitives/score) supports a five-level relevance rubric. This project normalizes the ordinal result from 0–4 to 0–1. Averaging it is an operational convenience, not proof of equally spaced semantic quality.

The [noul primitive](https://docs.typesafe.ai/primitives/noul) returns a probability for a specific question. This project's question concerns nonsense under its rubric; the number is **not a general hallucination, factual-error or safety probability**. Relevance also does not establish factual correctness.

[Evaluator confidence](https://docs.typesafe.ai/confidence) measures certainty in the evaluator decision. A confident evaluator can be wrong; confidence of 1 is not truth. Response shape/bounds/distribution validation establishes format, not empirical calibration.

Before paging: freeze model/rubric versions; collect a representative permissioned dataset; obtain independent domain labels and record disagreement; evaluate ranking, precision/recall and calibration on held-out examples; inspect language/workload slices outside Prometheus labels; shadow alerts and review misses/false positives. Repeat after provider, rubric or instrumentation changes.

Coverage matters: missing evaluations do not mean good quality, and exported spans may themselves be a biased sample. The example relevance rule requires 20 observations in 5 minutes, 80% successful coverage, and 2 sustained minutes below 0.6. Those values demonstrate mechanics and need workload calibration. Low coverage and no-data rules expose blind spots. The no-data rule intentionally fires an informational alert for a quiet service.

Deterministic PromQL is repeatable for fixed data. That does not guarantee a deterministic evaluator or zero false positives.

## Synthetic benchmark

`npm run benchmark -- 200` warms up 20 one-span requests and measures sequential Fastify injection, deterministic synthetic scoring and a loopback HTTP collector. JSON includes runtime/platform, sample count and p50/p95/p99/max milliseconds.

It does not measure live Jev latency/accuracy, network geography, concurrent saturation, durable collector storage or generation response time. Retain the command and runtime with measured results. No universal overhead or throughput claim is made.
