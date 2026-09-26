# Contributing

Use Node.js 22 or 24. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build` and `npm run demo`. No live provider key is required. Deployment changes also require the [Compose/promtool checks](docs/deployment.md).

Open an issue before substantial changes. Keep patches focused; add behavioral tests for contract changes and update adjacent docs. Preserve identity, bounded queues/labels, privacy defaults and explicit failure states. Never add real secrets/content to fixtures.

Pull requests should explain the problem, observable change, actual checks and remaining limits. Do not claim unrun checks. Contributions are under Apache-2.0. Follow the [code of conduct](CODE_OF_CONDUCT.md) and report sensitive issues through [SECURITY.md](SECURITY.md).
