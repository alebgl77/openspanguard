# Local deployment

Start with `docker compose up --build -d --wait`, then `node examples/stack-smoke.mjs`. Run `node examples/send-demo.mjs 180` to populate dashboard rates with three minutes of synthetic traffic.

The smoke script waits for services, exports a span, verifies original identity in Tempo, checks metrics and dashboard provisioning, and injects one alert into Alertmanager to prove local delivery. Injection tests routing; promtool fixtures test the actual alert rules.

| Loopback port | Service |
| --- | --- |
| 4318 | Gateway traces, health and metrics |
| 4319 / 13133 | Collector receiver / health |
| 3200 | Tempo API |
| 9090 / 9093 | Prometheus / Alertmanager |
| 9080 | Local webhook |
| 3000 | Grafana anonymous Viewer |

The demo network is unauthenticated between containers. Tempo storage is tmpfs and disappears on stop. Prometheus retains 24 hours in a named volume; Grafana also uses a named volume. The webhook logs only bounded name/status/severity/cohort values and exposes a count at `/healthz`; it sends nothing externally.

`docker compose down` stops the stack. `docker compose down -v` also deletes its named metric/Grafana volumes.

## Validate rules

From a POSIX shell in the repository root:

```sh
docker run --rm --entrypoint promtool -v "$PWD/deploy:/work" -w /work prom/prometheus:v3.15.0 check rules alerts.yaml
docker run --rm --entrypoint promtool -v "$PWD/deploy:/work" -w /work prom/prometheus:v3.15.0 test rules alerts.test.yaml
```

Fixtures cover the two-minute hold, sample floor, coverage gate, missing success series and recovery. Change rules and fixtures together.

CI validates Node 22/24 tests, Docker Compose config/build, promtool and the full local-stack smoke on Ubuntu. A workstation without Docker can run the offline demo and tests, but that is not a container validation. Inspect [Actions](https://github.com/alebgl77/openspanguard/actions) for actual release evidence.

Image pins are reproducibility inputs, not perpetual security guarantees. Review Dependabot and advisories before deploying. All exposed ports are loopback-only; do not change bindings without implementing the [production checklist](production-checklist.md).
