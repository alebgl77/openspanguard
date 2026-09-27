# Image art-direction prompt set

Provenance: four project PNGs generated with ChatGPT image generation. This document records the art direction and targeted revisions in compact form; it is not a byte-for-byte transcript of tool prompts. Images are explanatory artwork, not product screenshots or measured results. Editable `.drawio` companions preserve technical diagrams separately.

## Hero

**Asset:** [openspanguard-hero.png](openspanguard-hero.png).

Create a premium developer cover in a 2:1 composition. Use midnight navy `#0b1220`, ivory, teal `#26d6b5` and ice blue, a subtle grid and Swiss editorial typography. Include the exact text “OpenSpanGuard”, “Make AI quality observable.”, “OpenTelemetry · Jev · Quality signals”, “OPEN SOURCE”, “DEVELOPER PREVIEW” and “github.com/alebgl77/openspanguard”. Show trace bars passing through a hexagonal pulse into three metric tiles. Do not add numerical results, performance claims, third-party logos or 3D effects.

## Architecture

**Asset:** [architecture.png](architecture.png). **Editable companion:** [architecture.drawio](architecture.drawio).

Create a high-resolution 3:2 Visio-style diagram with a flat ivory background, navy text, teal/blue accents and orthogonal connectors. Use three lanes. APPLICATION: AI agent → OTel SDK, completed spans and asynchronous export. EVALUATION: SDK sends OTLP/HTTP JSON to OpenSpanGuard; steps are authenticate and bound, extract and evaluate, redact known content, preserve trace IDs. Optional bidirectional Jev API supplies Score: relevance and Noul: nonsense, with explicit opt-in. Gateway → OTel Collector → Tempo. OPERATIONS: gateway metric data is scraped by Prometheus; Prometheus → Alertmanager → Webhook. Tempo and Prometheus feed Grafana. There is no Webhook → Grafana connection. Footer: “Scoring runs on the export path. Evaluation signals are not proof of correctness.”

Targeted revision: remove an erroneous Webhook/Grafana connector and whiten the background for readability. Diagram data-flow arrows for metrics mean scraped data; Prometheus initiates the scrape. The README's Mermaid fallback shows the request direction explicitly.

## Quality loop

**Asset:** [quality-loop.png](quality-loop.png). **Editable companion:** [quality-loop.drawio](quality-loop.drawio).

Create a flat white 3:2 diagram with navy/teal Visio-style shapes. Use five connected panels: “Cohort signals / 5-minute window” → “Quality gate / Mean relevance < 0.60 / At least 20 scored spans / Evaluation coverage ≥ 80%” → “Hold condition / For 2 minutes” → “Alertmanager / Group + route” → “Webhook / Notify operators”. Add a separate band: “Low coverage and missing telemetry have separate alerts.” Footer: “Deterministic rules. Probabilistic evaluation.” and “Thresholds need calibration on your data.” Include Developer Preview.

Targeted revision: remove the cloudy background and use flat white, preserving the content and connectors.

## Social preview

**Asset:** [social-preview.png](social-preview.png).

Create a 2:1 social card, requested at 1280 × 640. Use a flat navy background with large ivory “OpenSpanGuard” and “Make AI quality observable.”, plus “OpenTelemetry · Jev · Open source” and “Developer Preview” below. Show three simple trace bars entering a pulse shield. Allow generous padding. No extra URL, statistics or performance claims.

Light-edition revision: preserve the composition and text; change the background to pure white and text to midnight navy, retain teal/blue accents, and use flat fills without grain or gradients. Generated dimensions can differ from the requested size; inspect the delivered asset before platform upload. Packaging may apply lossless compression without changing pixels.

[Media kit](../media-kit.md)
