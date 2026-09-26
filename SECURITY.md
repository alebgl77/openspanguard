# Security policy

The latest developer preview is the current maintenance target; no long-term support commitment is made.

Report vulnerabilities privately through [GitHub security advisories](https://github.com/alebgl77/openspanguard/security/advisories/new). If private reporting is unavailable, request a private contact in an issue without exploit details, customer content or keys. Maintainers coordinate disclosure; response times are best effort.

Include the affected version/commit, synthetic reproduction, expected/actual behavior and impact. Do not test someone else's deployment without permission.

Live Jev evaluation sends explicitly captured content remotely. Recognized-content redaction is not a universal PII sanitizer. Operators must configure authentication, TLS, isolation, rotation and delivery durability. See the [production checklist](docs/production-checklist.md).

The Compose stack is a local synthetic demo with read-only anonymous Grafana and ephemeral Tempo. Do not expose it publicly or reuse it unchanged for sensitive workloads.
