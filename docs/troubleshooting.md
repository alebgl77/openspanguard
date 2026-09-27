# Troubleshooting

Start with `npm run demo`. A final `"result": "pass"` verifies the synthetic loopback path independently of Docker or a remote evaluator. For the Compose stack, run `docker compose ps` and `node examples/stack-smoke.mjs`. Use [configuration](configuration.md) to compare actual environment variables with supported values.

## Install or startup fails

- Use Node.js 22 or 24; check `node --version` and `npm --version`.
- Run `npm ci` from the repository root, then `npm run build` before `npm start`.
- If PowerShell blocks `npm.ps1`, use `npm.cmd ci`, `npm.cmd run build` and `npm.cmd run demo`. You do not need to change the machine execution policy.
- `.env.example` is not loaded automatically. Set variables in the process environment or inject them through your deployment system. POSIX `export NAME=value` and PowerShell `$env:NAME = 'value'` are different syntaxes.
- `OSG_OTLP_ENDPOINT` must end in `/v1/traces`. It is required outside an explicit demo sink. A source-run gateway can reach the Compose collector at `http://127.0.0.1:4319/v1/traces`.

## HTTP 401 or non-loopback binding is refused

If `OSG_API_KEY` is set, send `Authorization: Bearer <key>` to both `/v1/traces` and `/metrics`. The inbound key must be at least 32 characters. Binding beyond loopback requires that key outside demo mode. `/healthz` and `/readyz` are public, so a successful health check does not verify authentication.

The downstream collector uses a separate `OSG_OTLP_AUTH` credential. Inbound credentials are not forwarded. Configure Prometheus scrape authorization when enabling gateway authentication; the local demo configuration assumes no key. Keep keys out of public reports.

## HTTP 415, 400 or 413

| Response | Check |
| --- | --- |
| 415 | Send OTLP/HTTP JSON with `Content-Type: application/json`. Use the `-http` exporter, not `-proto` or gRPC. |
| 400 | Validate OTLP structure, identity fields, nested values and configured batch/depth limits. Start from a synthetic fixture. |
| 413 | Reduce the body or batch size; compare against `OSG_BODY_LIMIT` and documented limits before changing them. |

## Spans have no scores

Inspect `openspanguard.evaluation.status` on the exported span and `openspanguard_evaluations_total{cohort,status}` in metrics. Detailed reason values are internal; this preview does not export a reason attribute or reason metric label. Use the status and configuration to narrow the cause:

| Exported status | Checks |
| --- | --- |
| `skipped` | Capture supported prompt/response fields before `span.end()` and keep each field within 32,768 UTF-16 code units. Check that evaluation is enabled, then inspect load and queue bounds. |
| `timeout` | The evaluation deadline includes queue wait; inspect load and provider latency. |
| `error` | Check the provider credential, endpoint, network access and service status privately. Also check that trace/span identities are not reused for different content. |

Model and token attributes alone are insufficient for evaluation. Select `demo` for synthetic validation, then compare a single valid generation against the failing workload to isolate content, configuration or load differences.

Jev requires **both** `OSG_JEV_API_KEY` and `OSG_ALLOW_REMOTE_CONTENT=true`. A format-valid result still needs workload calibration. See [Jev setup](../README.md#enable-live-jev-evaluation) and [measurement](measurement.md).

## HTTP 503 or missing traces in Tempo

`overloaded` indicates gateway admission pressure or shutdown. `downstream_unavailable` indicates a downstream request, response or timeout failure. Inspect collector reachability and `OSG_EXPORT_TIMEOUT_MS`; in Compose, the collector hostname is `collector`, while the host-facing port is `4319`.

Retry according to your SDK policy. Evaluation deduplication is process-local and bounded; HTTP acceptance is not a durable-storage guarantee. A provider timeout alone can leave a span unscored while export continues. Review the `openspanguard_export_failures_total` counter and sanitized service logs.

## Grafana panels are empty or alerts do not fire

1. Run `node examples/send-demo.mjs 180`; rate panels need more than one scrape. Keep the dashboard time range on recent data.
2. Inspect [Prometheus targets](http://127.0.0.1:9090/targets) and the gateway's `/metrics` endpoint. If auth is enabled, verify scrape credentials.
3. Check `openspanguard_spans_total` and `openspanguard_evaluations_total`. No successful evaluations means no observed quality samples.
4. Check the cohort: unknown values map to `default`. Quality alerts are gated by sample count, coverage and sustained duration; the smoke test injects an alert to test routing independently of these gates.

Tempo storage disappears when the demo stops. The stack is a local demonstration; see [deployment](deployment.md) for persistence and cleanup.

## Docker permissions or ports fail

Ensure Docker Engine is running and your account has authorized access to its daemon. Check `docker compose version` and inspect `docker compose ps`. Close the service occupying a required loopback port or use a deliberate local Compose override with matching script endpoints. Do not solve daemon permissions by making its socket world-writable or exposing the demo publicly.

Still blocked? Submit a [sanitized integration report](https://github.com/alebgl77/openspanguard/issues/new?template=integration_report.yml) with version, transport, evaluator mode, reproduction and observed status. Follow [Security](../SECURITY.md) for sensitive reports.
