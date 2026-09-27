# Editable architecture diagrams

OpenSpanGuard includes presentation PNGs and separate editable diagrams.net sources. The `.drawio` files are uncompressed XML with editable shapes, labels, containers, and orthogonal connectors. They are not native Microsoft Visio `.vsdx` files, and the generated presentation PNGs are not exact exports of these sources.

| Diagram | Presentation image | Editable source |
| --- | --- | --- |
| Architecture and telemetry paths | [architecture.png](architecture.png) | [architecture.drawio](architecture.drawio) |
| Cohort quality and alert conditions | [quality-loop.png](quality-loop.png) | [quality-loop.drawio](quality-loop.drawio) |

## Open, edit, and export

1. Download the `.drawio` source using GitHub's **Download raw file** action, or use the file in a local clone.
2. Open it in the diagrams.net desktop application, or at [app.diagrams.net](https://app.diagrams.net/) using **File → Open from → Device**.
3. Edit the individual shapes, labels, and connectors. The lanes group stages of the flow; they do not imply network isolation or a security boundary.
4. Save a `.drawio` copy to retain the editable source. Export a PNG, SVG, or PDF from **File → Export as** when you need a presentation asset.
5. Before sharing, check the text at the intended display size and compare all rule values with [`deploy/alerts.yaml`](../../deploy/alerts.yaml).

The `.drawio` sources use the same navy, ivory, and teal palette as the project page. Keep request arrows and data-flow arrows explicitly labeled when changing the layout. Do not replace the process-local cache or preview boundaries with stronger guarantees.

## Architecture: text equivalent

1. An AI agent explicitly captures supported generation content and finishes a span.
2. An OpenTelemetry SDK with an asynchronous span processor exports the completed span to OpenSpanGuard using **OTLP/HTTP JSON**. Protobuf is unsupported in this preview. With that SDK configuration, generation does not synchronously wait for evaluation; trace export still incurs evaluation and downstream delivery latency.
3. OpenSpanGuard validates and bounds input, evaluates eligible generations, removes recognized content fields, and enriches the exported spans. The original ended SDK span is not modified. Trace IDs, span IDs, and timestamps are preserved.
4. Remote Jev scoring is optional. Explicit capture and `OSG_ALLOW_REMOTE_CONTENT=true` authorize captured content to be sent to the configured evaluator. Requests use the `score` and `noul` primitives; results return to the gateway. Incoming telemetry and process memory contain raw content before redaction. Unrecognized custom fields can retain content. Minimize data at the application.
5. The gateway forwards traces to an OpenTelemetry Collector, which delivers them to Tempo in the example stack.
6. **Prometheus initiates a scrape of the gateway's `/metrics` endpoint.** The arrow points from Prometheus to the gateway because it represents a pull request; the gateway returns metrics.
7. **Grafana queries Prometheus and Tempo.** Its arrows point to the two data sources and represent queries, not data pushes into Grafana.
8. Prometheus evaluates alert rules and sends firing alerts to Alertmanager. Alertmanager groups and routes them to a webhook; the local stack uses a demo receiver.

The cache is bounded and process-local. Expiry, eviction, restarts, or another replica can cause repeat evaluation. There is no disk queue or exactly-once guarantee. Live Jev accuracy and latency are unbenchmarked. See the [architecture](../architecture.md), [integration](../integration.md), and [production checklist](../production-checklist.md).

## Quality loop: exact text equivalent

The source of truth is [`deploy/alerts.yaml`](../../deploy/alerts.yaml). The group is evaluated every **15 seconds**. The horizontal gates in the diagram are a conceptual reading of a single PromQL conjunction, not sequential software jobs. Conditions join on the same `cohort` label.

`OpenSpanGuardLowRelevance` fires a warning when **all three conditions remain true for 2 minutes**:

- The sum by cohort of `increase(openspanguard_quality_score_count[5m])` is **at least 20**.
- The sum by cohort of `rate(openspanguard_evaluations_total{status="ok"}[5m])`, divided by the sum by cohort of `rate(openspanguard_spans_total[5m])`, is **at least 0.8**. This is successful evaluation coverage relative to observed generation spans, not relative only to spans eligible for scoring.
- The sum by cohort of `rate(openspanguard_quality_score_sum[5m])`, divided by the sum by cohort of `rate(openspanguard_quality_score_count[5m])`, is **below 0.6**.

Coverage metrics record the first observed outcome per identity window. A later retry can succeed and enrich a trace without updating the previously recorded coverage outcome for that window. Counts suppress repeat identities within the live process-local cache. Exported spans can themselves be a biased sample of application traffic. The thresholds are calibration starting values, not universal SLOs.

Two independent rules expose blind spots and route through Alertmanager too:

- **`OpenSpanGuardLowCoverage` — warning:** successful evaluation coverage below 0.8 **and** at least 20 observed spans in a 5-minute window, held for 2 minutes. Missing successful-evaluation series are treated as zero for cohorts with observed spans. Its sample gate counts observed spans; the relevance rule's gate counts scored evaluations.
- **`OpenSpanGuardNoData` — info:** `up{job="openspanguard"} == 0`, an absent `up` series for that job, zero total observed-span increase over 10 minutes, **or** an absent span counter, held for 2 minutes. A quiet service can intentionally trigger this informational alert.

Alertmanager routes firing alerts to the configured webhook. Relevance does not establish factual correctness; confidence is not truth; the `noul` result answers this project's rubric-specific nonsense question and is not a general hallucination probability. Read the [measurement limits](../measurement.md) before interpreting or calibrating the signals.
