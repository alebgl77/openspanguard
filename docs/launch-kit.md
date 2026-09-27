# Launch kit

Ready-to-copy drafts for the maintainer. Verify the release gate in the [launch plan](launch-plan.md), then choose channels and publish manually. No outreach or publication is performed by these documents. Keep the Developer Preview and synthetic-demo wording when adapting the copy.

## LinkedIn · English

Your AI traces show what ran. Can you see which generations were evaluated—and which were missed?

I'm sharing OpenSpanGuard, an open-source Developer Preview for adding quality signals to your original AI traces.

It receives completed OTLP/HTTP JSON spans, evaluates eligible generations and forwards them with their original trace/span IDs and timestamps. Prometheus and Grafana bring relevance and evaluation coverage into the same operational workflow.

The source demo runs locally with synthetic scores and no provider API key. Optional Jev evaluation requires explicit remote-content opt-in. Scores need calibration on your workload; they are not proof of correctness.

If you work on AI observability, I'd value a reproducible integration report: where did setup become unclear, and which missing signal would change an operational decision?

Try the demo: https://github.com/alebgl77/openspanguard#try-the-demo

Apache-2.0 · Node.js 22 / 24 · Developer Preview

## LinkedIn · Français

Vos traces IA montrent ce qui s'est exécuté. Montrent-elles aussi quelles générations ont été évaluées — et lesquelles ont été manquées ?

Je partage OpenSpanGuard, un projet open source en Developer Preview qui ajoute des signaux de qualité aux traces IA d'origine.

La passerelle reçoit des spans OTLP/HTTP JSON terminés, évalue les générations éligibles et les transmet en conservant leurs identifiants et horodatages. Prometheus et Grafana permettent de suivre la pertinence avec la couverture d'évaluation.

La démo depuis les sources utilise des scores synthétiques, sans clé de fournisseur. Le mode Jev demande un consentement explicite à l'envoi du contenu. Les scores doivent être calibrés sur vos usages ; ils ne prouvent pas l'exactitude des réponses.

Vous travaillez sur l'observabilité IA ? Un retour d'intégration reproductible m'aiderait : où l'installation devient-elle floue, et quel signal manque pour prendre une décision opérationnelle ?

Essayer la démo : https://github.com/alebgl77/openspanguard#try-the-demo

Apache-2.0 · Node.js 22 / 24 · Developer Preview

## X · four-post thread

Each block is a separate post, under 280 characters including the displayed URL.

```text
1/4 Make AI quality observable. OpenSpanGuard adds quality signals to completed OTLP/HTTP JSON generation spans, preserving trace IDs. Open-source Developer Preview. Try the synthetic local demo: https://github.com/alebgl77/openspanguard
```

```text
2/4 A relevance score needs context: how many generations were actually evaluated? OpenSpanGuard exposes coverage, skipped evaluations and timeouts alongside cohort metrics for Prometheus and Grafana.
```

```text
3/4 Demo scores are synthetic. Optional Jev evaluation sends explicitly captured content remotely, before known fields are redacted from onward traces. It requires opt-in. Evaluator confidence is not proof of correctness.
```

```text
4/4 Looking for practical integration feedback: exporter compatibility, missing coverage or setup friction. Run the demo, then share a sanitized reproduction. Docs and reports: https://github.com/alebgl77/openspanguard
```

## Show HN · submission draft

**Title:** Show HN: OpenSpanGuard – Quality signals on original AI traces

**URL:** https://github.com/alebgl77/openspanguard

**First comment:**

Hi HN, I'm building OpenSpanGuard because I want to inspect AI evaluation signals in the same trace context I use to investigate application behavior.

It's a small OTLP/HTTP JSON gateway: it accepts completed generation spans, evaluates eligible content, removes recognized content fields and forwards enriched spans with their original identity and timestamps. Prometheus metrics expose evaluation coverage so missing evaluations don't silently look like good quality.

You can clone the repository, run npm ci, npm run build and npm run demo. The demo uses loopback services and synthetic scores; it needs no provider key. Docker Compose adds Tempo, Prometheus, Grafana and a local alert route.

This is a Developer Preview. It supports JSON, not protobuf or gRPC. The optional Jev adapter sends explicitly captured content remotely before redaction and requires opt-in. Evaluation is on the export path, with latency there; it is not a generation-time guardrail. The cache is bounded and process-local, with no disk queue or global exactly-once guarantee. Scores need calibration against domain labels.

I'd be interested in concrete integration failures and whether showing coverage beside relevance helps your debugging workflow. Synthetic reproductions are especially useful; please keep real prompts and credentials out of public reports.

Post when you can participate in the discussion and personalize the motivation to your actual experience. Link the runnable project, not a signup page. Do not ask for votes or coordinated comments. [Show HN guidelines](https://news.ycombinator.com/showhn.html).

## 60-second demo recording

Prepare dependencies and the local stack before recording. Use synthetic data and show the release commit. Keep the caption **“Developer Preview · synthetic demo scores”** visible. Do not splice a live-provider result into the synthetic walkthrough.

| Time | Screen | Voiceover |
| --- | --- | --- |
| 0–8s | README headline and Try the demo link | “OpenSpanGuard adds quality signals to the AI traces you already inspect.” |
| 8–20s | Run `npm run demo`; show final `result: pass` | “This local demo checks trace identity, explicit missing-content status and recognized-content redaction. All scores here are synthetic.” |
| 20–33s | Open Grafana after `node examples/send-demo.mjs 180` has populated it | “Read relevance together with evaluation coverage. Missing evaluations should stay visible.” |
| 33–44s | Show the architecture visual | “Completed JSON spans pass through bounded evaluation and onward to the collector. Jev is optional and requires explicit remote-content opt-in.” |
| 44–53s | Show measurement limits and example alert gates | “These scores and thresholds need calibration on your workload. Export still has evaluation and delivery latency.” |
| 53–60s | README demo command and integration-report link | “Try the source demo, then share a sanitized integration report. OpenSpanGuard is an Apache-2.0 Developer Preview.” |

[14-day action plan](launch-plan.md) · [Visual assets and fact sheet](media-kit.md)
