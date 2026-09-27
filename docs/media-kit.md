# Media kit

**OpenSpanGuard — Make AI quality observable.**

OpenSpanGuard is an independent, open-source OTLP/HTTP JSON gateway that adds evaluation signals to completed AI generation spans while preserving their original trace/span IDs and timestamps. It exposes coverage and cohort metrics for Prometheus/Grafana workflows.

## Fact sheet

| Field | Approved description |
| --- | --- |
| Status | Developer Preview; validate a canary before production |
| License | Repository code: [Apache-2.0](../LICENSE); hosted third-party services are separate |
| Runtime | Node.js 22 / 24 tested in CI |
| Distribution | Source checkout and locally built Docker Compose stack |
| Evaluation | Synthetic demo; optional remote Jev adapter with explicit content opt-in |
| Transport | OTLP/HTTP JSON completed spans |
| Website | [alebgl77.github.io/openspanguard](https://alebgl77.github.io/openspanguard/) |
| Repository | [github.com/alebgl77/openspanguard](https://github.com/alebgl77/openspanguard) |
| Questions | [GitHub Discussions](https://github.com/alebgl77/openspanguard/discussions) |

**[Download the media kit ZIP](https://github.com/alebgl77/openspanguard/releases/download/v0.1.0/openspanguard-media-kit.zip)** — supplemental visuals, editable diagrams and prompt notes for the Developer Preview.

| Asset | Intended use | Editable companion |
| --- | --- | --- |
| [Hero PNG](assets/openspanguard-hero.png) | README, launch article, presentation opener | [Art-direction prompts](assets/image-prompts.md#hero) |
| [Architecture PNG](assets/architecture.png) | Explain capture, evaluation, redaction and observability boundaries | [Architecture .drawio](assets/architecture.drawio) |
| [Quality loop PNG](assets/quality-loop.png) | Explain the sample relevance alert, its gates and calibration requirement | [Quality loop .drawio](assets/quality-loop.drawio) |
| [Social preview PNG](assets/social-preview.png) | Repository link preview and social card | [Art-direction prompts](assets/image-prompts.md#social-preview) |

The four PNG illustrations were created with ChatGPT image generation and reviewed for this project. The architecture and quality-loop images received targeted readability/connector revisions. The `.drawio` files are editable technical companions; the PNGs remain raster illustrations. See the [art-direction prompt set and revisions](assets/image-prompts.md) for provenance.

Use the original aspect ratio, retain readable margins and provide meaningful alt text. Keep the Developer Preview label. Use **midnight navy `#0b1220`**, **teal `#26d6b5`**, ivory/white and a system sans-serif stack (`system-ui`, `Segoe UI`, sans-serif). Text and diagrams should remain understandable without color alone.

## GitHub social preview

The supplied light social card is a **1774 × 887 PNG, 904,755 bytes**, packaged with lossless compression and ready for upload. The repository's committed image and GitHub's social-preview setting are separate. An authorized maintainer must upload it under **Settings → Social preview** after signing in. This kit does not assert that the upload has happened.

GitHub accepts PNG/JPG/GIF files under 1 MB and recommends 1280 × 640 for best display. Inspect the actual asset dimensions and file size before uploading; generation can return a larger 2:1 image. [GitHub social-preview guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview).

## Claims and attribution

Describe scores as evaluator signals and label synthetic screenshots. Do not turn confidence into proof of truth, the nonsense rubric into a general hallucination probability, or known-field redaction into automatic PII protection. Avoid fixed performance claims without a linked method and measured environment.

Mention OpenTelemetry, Grafana, Prometheus and Jev to explain interoperability. Do not imply official endorsement, certification or ownership of their brands. Use the project's own visuals without adding third-party logos. Pair a short announcement with the [runnable demo](../README.md#try-the-demo), [measurement limits](measurement.md) and [launch drafts](launch-kit.md).
