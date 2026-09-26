# Configuration reference

All runtime variables start with `OSG_`. Configuration is validated before listening. The process reads its environment; `.env.example` is documentation, not automatically loaded.

| Variable | Default | Limits / purpose |
| --- | --- | --- |
| `OSG_HOST` | `127.0.0.1` | Non-loopback requires bearer auth unless demo mode |
| `OSG_PORT` | `4318` | 0–65535; 0 chooses an ephemeral port for tests |
| `OSG_EVALUATOR` | `disabled` | `disabled`, `demo`, `jev` |
| `OSG_DEMO_MODE` | `false` | Explicit demo escape hatch for public binding or absent downstream |
| `OSG_API_KEY` | unset | 32–4096 characters; protects traces and metrics when set |
| `OSG_ALLOW_REMOTE_CONTENT` | `false` | Must be `true` for Jev |
| `OSG_JEV_API_KEY` | unset | Required for Jev; never commit |
| `OSG_JEV_ENDPOINT` | `https://api.typesafe.ai/v1/systemone` | HTTPS except loopback; redirects disabled |
| `OSG_JEV_MODEL` | `jev-latest` | Provider model identifier |
| `OSG_OTLP_ENDPOINT` | unset | Full URL ending in `/v1/traces`; required unless demo sink |
| `OSG_OTLP_AUTH` | unset | Separate downstream bearer token |
| `OSG_EVALUATION_TIMEOUT_MS` | `1000` | 10–60000 ms including queue wait |
| `OSG_EXPORT_TIMEOUT_MS` | `5000` | 10–60000 ms downstream deadline |
| `OSG_CONCURRENCY` | `8` | 1–128 concurrent evaluations |
| `OSG_MAX_QUEUE` | `128` | 0–4096 queued evaluations |
| `OSG_CACHE_SIZE` | `10000` | 1–100000 identities |
| `OSG_CACHE_TTL_MS` | `600000` | 100–86400000 ms |
| `OSG_MAX_INFLIGHT_REQUESTS` | `32` | 1–256 active trace requests |
| `OSG_BODY_LIMIT` | `2097152` | 1024–8388608 bytes |
| `OSG_MAX_SPANS` | `128` | 1–1024 spans per batch |
| `OSG_MAX_DEPTH` | `32` | 4–40 JSON nesting levels |
| `OSG_COHORTS` | `default,demo,canary` | Maximum 20 unique safe labels including default |

Unknown cohorts map to `default`. Boolean values must be exactly `true` or `false`. URLs reject credentials, query strings and fragments. Inbound credentials are never forwarded; use `OSG_OTLP_AUTH`. Each prompt, response and context is bounded to 32,768 UTF-16 code units. The SDK throws on overflow; incoming oversized evaluation content is skipped without silent truncation.

## Routes

| Route | Behavior |
| --- | --- |
| `POST /v1/traces` | OTLP HTTP/JSON; `Content-Type: application/json`; no protobuf or gRPC |
| `GET /healthz` | Public process liveness |
| `GET /readyz` | Public process readiness; not proof of downstream durability |
| `GET /metrics` | Prometheus exposition; bearer required if configured |

Full downstream acceptance yields OTLP `{}`. Partial acceptance relays `partialSuccess.rejectedSpans` with a sanitized message. Export failures/timeouts yield a retryable failure; malformed payloads and limits are rejected. Evaluation failures leave spans unscored while delivery can continue.

Metrics use prefix `openspanguard_`: `evaluations_total{cohort,status}`, `evaluation_duration_seconds`, `quality_score{cohort}`, `confidence{cohort}`, `nonsense_probability{cohort}`, `token_usage_total{cohort,type}`, `spans_total{cohort}`, `deduplicated_total`, `export_failures_total`, `inflight`. Histograms expose `_bucket`, `_sum` and `_count`.

Generation spans, including missing content, count toward `spans_total`. Duplicate exports still reach the collector; unique evaluation/sample/token counters use a bounded local identity cache. No prompts, user IDs, trace IDs, span IDs or model names are metric labels.
