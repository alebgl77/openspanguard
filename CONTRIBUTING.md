# Contributing

Start with the [demo](README.md#try-the-demo). Useful first contributions include reproducing an integration failure with synthetic spans, improving a confusing setup step, or adding a focused compatibility test. Discuss substantial changes in an issue before implementing them; the [roadmap](docs/roadmap.md) explains the preview's direction.

## Local checks

Use Node.js 22 or 24 from the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run demo
```

These checks require no live provider key. Use `npm.cmd` if PowerShell blocks `npm.ps1`. Deployment changes also require the [Compose/promtool checks](docs/deployment.md); documentation-only edits should verify the affected commands and links. Keep synthetic and live-provider evidence clearly separate.

## A useful patch

Keep changes focused and follow neighboring code. Add behavioral tests for contract changes and update adjacent documentation. Preserve trace identity, bounded queues and metric labels, privacy defaults and explicit failure states. Never add real secrets, customer prompts or unredacted traces to fixtures.

Pull requests should explain the problem, observable change, commands actually run and remaining limits. Do not claim unrun checks. For integration feedback, use the [integration report](https://github.com/alebgl77/openspanguard/issues/new?template=integration_report.yml); for questions, use [Discussions](https://github.com/alebgl77/openspanguard/discussions).

Keep the [French entry point](README.fr.md) aligned when changing quickstart commands or preview limitations. Label synthetic images and keep editable diagrams consistent with runtime behavior.

Contributions are under [Apache-2.0](LICENSE). Follow the [code of conduct](CODE_OF_CONDUCT.md) and report sensitive issues through [Security](SECURITY.md). Support is best effort; see [Support](SUPPORT.md).
