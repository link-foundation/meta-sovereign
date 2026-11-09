# Issue 56: unified automation and device architecture

Issue: <https://github.com/link-foundation/meta-sovereign/issues/56>. Draft implementation: <https://github.com/link-foundation/meta-sovereign/pull/57>.

The complete scope and open delivery gates are tracked in [PLAN.md](PLAN.md) and canonical requirements R-AA1–R-AA25. The issue asks for complete feature parity with six reference projects, a shared configurable automation model, browser fallback, associative storage/transport, recovery and cross-device operation. Passing an isolated test does not complete those remaining criteria.

## Evidence and chronology

- [salary-calculation.md](salary-calculation.md) records configurable progressive/company/payout calculations, dated rate snapshots, rounding-boundary and CLI/API/UI/delivery regressions, with production browser and MCP screenshots. Rate fetching/cache recovery and broader reference parity remain open.

- [ci-profile-selection.md](ci-profile-selection.md) preserves the correction run's separate WebKit profile-selection failure and opt-in diagnostics. The focused local scenario passes; no unproven birthday fix or timeout increase is claimed.

- [telegram-capabilities.md](telegram-capabilities.md) records unavailable notification/event requests from cached chat, explicit backend capabilities and recovery, with failing-before/passing-after API and browser evidence.

- [ci-native-rejection.md](ci-native-rejection.md) records the exact-head Rust TCP reset, a deterministic bounded failing-before regression and staged-close correction. The correction run passes Rust and all nine runtime jobs, including the previously timed-out Node/macOS job.

- [question-salary.md](question-salary.md) records independent configured targets, hourly rounding, related clarifications, unique range selection and CLI/API/UI/delivery regressions, with desktop/mobile screenshots. The calculation follow-up adds tax/FX math; rate fetching and full provider/form parity stay open.

- 2026-11-09 09:28 UTC: issue created. Initial issue and PR snapshots, including all three PR feedback endpoints, are in `evidence/github/`. They returned no comments, reviews or required sub-issues at collection; finalization must refresh them.
- Initial research pinned ten repositories, including all six feature references, browser-commander, link-cli, lino-rest-api and formal-ai. The complete downloaded metadata, commit/tree responses and READMEs are preserved in `data/reference-snapshots.tar.gz`, with per-file SHA-256 values in its adjacent manifest. Reference code is inspected outside the working tree and never executed.
- The initial code review found independent headless defaults across five browser entry points. [browser-defaults.md](browser-defaults.md) records the failing-before/passing-after reproduction and first fix.
- The next step added shared persistent visibility preferences and isolated slots. [browser-preferences.md](browser-preferences.md) contains implementation, test and visual evidence.
- [dependency-updates.md](dependency-updates.md) records the complete direct-dependency and CI tool audit, bounded codec experiments, focused checks and reproducible upstream transport reports.
- [lino-http.md](lino-http.md) records the structured HTTP migration, seven failing-before/passing-after cases, explicit JSON compatibility, browser upload verification and the remaining event/socket/native protocol work.
- [lino-events.md](lino-events.md) records the event-stream migration, bounded multiline/Unicode regressions, browser EventSource verification and compatibility behavior.
- [lino-sync.md](lino-sync.md) records negotiated text/binary WebSocket sync and WebRTC signaling/data, explicit JSON compatibility, bounded framing, real browser convergence and the TCP framing/CLI lifecycle and remaining native transport work.
- [lino-native.md](lino-native.md) records the native HTTP/socket migration, production JavaScript interoperability, bounded malformed-frame checks and the remaining native feature-parity limits.
- [recovery-dumps.md](recovery-dumps.md) records scheduled independent text/binary dumps, checked restore, persistent CLI/API/UI controls, lossless storage values and browser screenshots.
- [question-answers.md](question-answers.md) records shared saved rules, bounded matching, profile substitution, evidence-based learning, reviewed delivery and CLI/API/UI controls, with the advanced reference requirements still open.
- [question-policy.md](question-policy.md) records explicit corrections/aliases, rejected wording, optional punctuation equivalence and zero-count completed-questionnaire facts, with CLI/API/UI and browser evidence.
- [question-context.md](question-context.md) records configured context groups, bounded same-chat history, actual vacancy metadata, no cross-choice value leakage and delivery revalidation through CLI/API/UI, with desktop/mobile evidence. Typed salary and form workflows remain open.
- Related merged PR 51's six before/after images were downloaded from its `issue-50-d289f94d6edd` branch, validated as PNGs and visually inspected. They show the runtime-version landing correction, message selection and tutorial spacing conventions. The originals are retained in `data/pr51-screenshots.tar.gz` with verified hashes; they are reference evidence, not this PR's verification screenshots.
- [desktop-builder.md](desktop-builder.md) records the desktop CI metadata failure after updating the builder and the compatibility correction for existing updater installations.
- [ci-transport-regressions.md](ci-transport-regressions.md) records the HTTP migration's remaining callers/fixtures and their focused verification. [chat-layout.md](chat-layout.md) records the shared scroll race exposed by browser CI, with before/after evidence.
- CI run [42595819230](https://github.com/link-foundation/meta-sovereign/actions/runs/42595819230), created 09:45:19 UTC for exact commit `76d16775e84303fecb38d11aedcdc585a0b63893`, failed formatting. Log lines 2203–2210 identify eight raw GitHub JSON snapshots; line 2211 reports formatting errors. The downstream checks were skipped, not passed. The snapshots were formatted in commit `3374762d`. Full logs and job metadata are in `data/ci-42595819230.tar.gz`; this diagnosis must be rechecked on the next pushed head.
- CI run [42598669128](https://github.com/link-foundation/meta-sovereign/actions/runs/42598669128), created 10:08:25 UTC for exact commit `abb10e28ddbadfa2ea623d30b8035a4180f6bb96`, passed formatting but rejected two changesets. Log lines 1202–1208 require exactly one changeset per PR; line 12916 identifies that gate as the pipeline failure. The two release notes were combined without changing their release level or behavior. Full logs are retained locally in `ci-logs/checks-and-release-42598669128.log`.

## Research and open analysis

The source pins are retained in the research archive rather than assuming moving branches remain unchanged. The [granular reference inventory](reference-feature-inventory.md) records the first source pass and partial implementation evidence; exhaustive source auditing and remaining feature verification are still required. The case study will expand each requirement's root cause, alternatives, selected approach, online evidence and validation as implementation proceeds. No unimplemented reference feature is presented as complete here.

Evidence archives can be reproduced with `experiments/issue-56/archive-evidence.py`; collection uses `experiments/issue-56/collect.py`. Archive creation verifies every file against its hash. The original JSON issue body remains readable in `evidence/github/issue-56.json`.
