# Developer Preview launch plan

**Make AI quality observable.** Lead with a runnable source demo, preserved trace context and visible evaluation coverage. The audience is engineers already operating instrumented AI applications. The adoption path is **demo → synthetic integration → permissioned canary → calibrated alerts**.

## Release gate

Before announcing, require green source tests, typecheck/build, demo, Compose smoke and promtool fixtures on the release commit. Verify the clean-checkout commands, license, private security reporting, README links, Pages site and Discussion entry points. Label all demo scores synthetic. Review JSON-only transport, explicit capture/remote opt-in, known-field redaction and process-local cache limits.

Use the [launch kit](launch-kit.md) and [media kit](media-kit.md). The repository and documentation are the durable home; LinkedIn and X explain one concrete workflow and lead back to the demo. Relevant community threads can provide technical feedback when their rules permit sharing. Maintainers choose timing and publish manually; this plan does not authorize automated posts or unsolicited messages.

## First 14 days

The schedule begins when the release gate passes. These are proposed actions, not completed outreach or promised results.

| Day | Action | Evidence to record |
| --- | --- | --- |
| 1 | Repeat the quickstart from a clean checkout; inspect EN/FR entry points. | OS, Node version, commit and pass/failure stage |
| 2 | Record the 60-second walkthrough; verify synthetic labels and readable terminal output. | Replayable recording and exact demo command |
| 3 | Invite feedback from existing, consenting technical contacts. | Voluntary demo completions and friction reports |
| 4 | Fix the most frequent installation failure and update troubleshooting. | Reproduction, fix and successful retry |
| 5 | Publish the maintainer's LinkedIn announcement with the runnable demo. | Visits where available; qualified replies, not impressions alone |
| 6 | Answer integration questions; turn repeated questions into FAQ entries. | Time to first useful answer and unresolved blockers |
| 7 | Review the first week and choose one integration workflow to improve. | Reported attempts, completions and failure reasons |
| 8 | Publish the short technical X thread, if that channel has a relevant audience. | Runnable-demo referrals and substantive questions |
| 9 | Share Show HN only when maintainers can discuss the implementation. | Technical feedback, reported runs and specific objections |
| 10 | Pair with willing evaluators on synthetic application spans. | Export transport, trace identity, coverage and redaction checks |
| 11 | Collect optional canary reports from teams with content permission. | Workload context, evaluation gaps and privacy constraints |
| 12 | Document one real integration result with permission, including limitations. | Reproducible environment and negative findings |
| 13 | Prioritize recurring issues; publish a focused fix if ready. | Resolved blockers and retry outcomes |
| 14 | Share an evidence-based recap and update the roadmap. | What worked, what failed and the next measured experiment |

## Measure adoption without inventing telemetry

The demo does not report installations to the maintainer. Count **self-reported** install attempts and successful demos, and always state that this is an incomplete sample. Record only volunteered, sanitized information. A qualified feedback item includes a use case, environment and reproducible finding; an emoji reaction does not.

Track successful synthetic integrations, permissioned canary evaluations, repeated installation failures and blocker resolution time. Separate live results from synthetic runs. Stars, impressions and traffic are context, not installation counts or evidence of quality. Set numeric targets after observing the first week's baseline; publish denominators with any conversion rate.

## Channel and repository setup

Suggested topics: `opentelemetry`, `otlp`, `observability`, `llm`, `ai-agents`, `evaluation`, `prometheus`, `grafana`, `typescript`. Use only relevant topics; GitHub permits up to 20, with lowercase letters, numbers and hyphens. [GitHub topic guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics).

Show HN should link directly to the runnable repository, explain the maintainer's personal work, and invite substantive technical discussion. Do not solicit votes or coordinated comments. Follow the [Show HN guidelines](https://news.ycombinator.com/showhn.html).

Set the repository social preview manually from the [media kit](media-kit.md) after signing in with repository permissions. A committed image does not change GitHub's preview setting. Advertise registry packages or images only after those artifacts actually exist.
