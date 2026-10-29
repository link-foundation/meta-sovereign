# Complete template and practice comparison

## Scope and reproducibility

Every recursive Git tree was collected without truncation. Every blob was downloaded, hashed and assigned a counterpart/disposition, including template-only files. This is a comparison of policy and behavior; template demo applications, release histories, credentials and package identities must not replace this application.

| Repository | Immutable revision | Tree entries / files |
| --- | --- | --- |
| js-ai-driven-development-pipeline-template | 0a3957d8195271829aa3cd5adce58a98fe73be2b | 544 / 482 |
| rust-ai-driven-development-pipeline-template | 0ece2cf2c2745c3574ffb65dbabdfcadd7163c14 | 241 / 202 |
| python-ai-driven-development-pipeline-template | 317c243a7cc832b0abfe4d30989c5095d17fcd78 | 132 / 121 |
| link-assistant/hive-mind practices | 279ac05609d2a791c184c4f9fe7ee071e40ef6a4 | Complete 571-line document |

Inside the archive, `comparison/all-template-files.json` records every path, upstream blob identity, SHA256, local counterpart/digest and disposition. Per-template Markdown lists every file; `.diff` files retain complete text differences for counterparts. `comparison/CI-ROLES.md` maps every workflow/action/helper/config path, including unmatched files. `research/template-workflow-semantics.txt` records all workflow jobs, dependencies, conditions, concurrency, deadlines and action versions; it was reviewed in full. This avoids treating filenames alone as evidence of equivalent behavior.

## Workflow and language decisions

| Template workflow/config family | Product implementation and decision |
| --- | --- |
| All three release.yml workflows | Existing release.yml has complete change-range detection, fresh-merge simulation, required terminal gate, changeset/version checks, controlled writers and registry/GitHub recovery. Repaired local HEAD resolution and note behavior rather than copying an upstream language's publisher. |
| All three security.yml, CodeQL and zizmor configs | Product scheduled-security and release paths already require dependency/secret checks and valid SARIF with reviewed exact exceptions. Privileged jobs do not consume dependency caches. PR CodeQL baseline configurations remain present even on docs changes. |
| All three workflows.yml | Product workflow-lint job uses the pinned Docker actionlint distribution with ShellCheck and pyflakes, standalone ShellCheck, pinned offline zizmor across all `.github` (including actions and Dependabot), policy contracts and evidence verification. Self-repository action syntax and routine-version cooldowns address findings without disabling the audits. A standalone actionlint binary without optional tools is insufficient. |
| All three links.yml, lychee config/ignore | Product links.yml and recheck helpers require valid reports, classify network failures and do not turn a broken source link green because a web archive exists. Product language/docs paths remain included. |
| JS example-app / javascript-first-example / javascript-first-gate; Rust javascript-first examples/gate | Template self-tests for sample consumers are not product publication jobs. Product already gates its actual desktop, mobile, package and browser applications and all nine Node/Bun/Deno OS combinations. Do not import sample package names or replace the native Rust workspace. |
| Rust desktop-release.yml, package-desktop/resolve helpers | Product desktop-release.yml already resolves exact source/release evidence, separates build and publish, preserves native ARM packaging and serializes publication. Existing blocked notices are accurate; do not make failure recovery accept incomplete upstream checks. |
| Python docs.yml, docs/requirements.txt and pyproject docs extras | Product Pages builds its multilingual static/API docs with its pinned JavaScript tooling. Python template Sphinx/PyPI-specific dependencies are not needed to document this product. |
| DockerHub/buildx composite actions and registry build/publish checkers | Product has a runnable Dockerfile/container smoke check but does not promise DockerHub/GHCR release publication. Architecture-native builds and manifest assembly are required if an image publication target is added; adding a new registry/publisher is outside the issue's existing product scope. |
| Rust crates.io publisher/preflight/visibility helpers and manifest bumpers | The embedded crate is validated with fmt/clippy/test/audit and warnings-as-errors, including rustdoc in check and release paths. It is not an independently published crate. Preserve Cargo.lock and crate identity; no crates.io credentials or fake publish required. |
| Python PyPI publisher/manifest/version/audit helpers | Python files in this repository are experiments/evidence utilities, not a distributable PyPI package. Existing compileall and workflow pyflakes/ShellCheck cover maintained scripts; no sample pyproject/PyPI release is introduced. |
| JS manifest/locks, Bun/Deno config, root lint/format/secrets/duplicates configs | Existing product pins/toolchain alignment and install policy are retained. npm cache policy now explicitly disables implicit setup-node saving, with designated workflow/platform writers. Root pre-commit config is explicit so immutable archived templates cannot execute nested hooks. |
| Rust/Python pre-commit config; JS .husky and install-git-hooks | Product uses its existing Husky/lint-staged system plus CI enforcement. Duplicating another hook manager would not strengthen the gate. Hooks run only maintained files under root policy. |
| Template docs, changesets, tests/fixtures, source/examples/assets and prior audit data | Every file is inventoried and archived. Reuse relevant policies and regressions; do not overwrite application source, install demo dependencies or import template changelog history as product changes. |

The primary difference that explains this incident is local target forwarding: current templates do not all send literal local `HEAD`, so this failure is not indiscriminately reported to all three projects. Conversely, the fenced-section boundary is shared: JavaScript/Python executed failures and Rust source analysis are distinguished in the reports. Current JavaScript already preserves more release content and links PRs across multiple changelog commits than the old local fork; those improvements informed this repair. Its single first-page PR selection remains incomplete; the downstream repair retains every relevant PR on every response page.

## Hive Mind principles, one by one

| Principle | Applicability, implementation and verification |
| --- | --- |
| 1 Relevant change detection | Complete PR comparison/change ranges and maintained workflow/helper paths; docs-only scopes still provide required security baselines. Existing ci-workflows and detection regressions remain required. New shared release helper is included in desktop PR paths. |
| 2 File size limits | Maintained source size checks and modular helpers. Immutable audit evidence is excluded from product lint and stored in a bounded compressed file; individual archive members remain hashed. |
| 3 Automated formatting | Root Prettier/Husky/lint-staged and CI formatting; no hidden template hook discovery. Changed files checked before commits. |
| 4 Static analysis/linting | ESLint, Rust fmt/clippy/rustdoc warnings-as-errors, workflow ShellCheck/pyflakes/actionlint, offline zizmor, secrets/duplicates and Python compilation. |
| 5 Fast-fail ordering | Version/change detection and release credential preflight precede expensive builds; release waits on terminal status covering 19 non-writer check jobs. A skipped unknown prerequisite cannot authorize publication. |
| 6 Changeset versioning | Patch fragment in this PR; version helper updates only root lockfile version fields and supports instant mode. No manual lock dependency resolution or double version bump. |
| 7 Validate actual merge | Fresh main merge simulation and validated-tree guard; only authorized release metadata may advance after validation. The release target is resolved after that advancement. |
| 8 Pre-commit hooks | Explicit root lint-staged configuration; same checks remain enforced in CI. Snapshot data cannot inject nested lint-staged tasks. |
| 9 Release automation | OIDC npm publication, strict registry evidence/recovery, exact Git target and robust notes; normal and instant modes share helpers. Publication credentials are not replaced by permissive fallbacks. |
| 10 Concurrency control | Read-only jobs cancel only their superseded counterparts; all external writers share the main non-cancelling queue. Cache saves now have explicit single owners, and workflow/platform/arch identity prevents cross-workflow contention. |
| 11 Secrets detection | Secretlint and security workflows remain required. Fixtures clear GH tokens, use fake APIs and isolated repositories. Debugging remains opt-in and redacted. |
| 12 Documentation validation | Four-language requirements/operations updated, existing required-docs/link/API checks retained. Audit archive verifier prevents corrupt evidence from looking like a successful collection. |
| 13 Native image architectures | No container registry publication currently promised. Native desktop packaging and runtime OS coverage remain required; no QEMU cross-build is substituted for native validation. See Docker family decision above. |
| 14 Lint workflows themselves | Pinned Docker actionlint contains both ShellCheck and pyflakes; pinned standalone ShellCheck and zizmor run without severity filters. Existing workflow contracts audit gates/writers; new cache contract audits every setup-node path. |
| 15 Audit dependency tree | npm audit, cargo audit and pinned dependency/deprecation/install-script policy already required. No blanket warning suppression or unreviewed major override added. Python has no independently installed product dependency tree. |
| 16 Prove publication before build | Credential/dependency-graph preflight, explicit administrator guidance on main, PR-safe capability checks. Registry probes distinguish exact version, explicit missing and unknown; refused states fail before writes. |
| 17 Broken pipeline vs changed world | This run's local malformed target is fixed in source. Managed OpenSSL/runner notices, actual capacity queues, skipped desktop artifacts and intentional negative-test strings have separate evidence-based dispositions. Queued/cancelled checks never stand in for a fresh pass. |

No runtime/browser gate or SARIF finding was removed, no timeout was raised to hide a failure, and TLS remains enabled. The known actionlint 1.7.12 self-repository false positive has an exact-reference/path exception with negative checks and an upstream removal condition; real action errors and ShellCheck failures still fail. Broad runtime/browser/Rust/packaging verification runs in CI in accordance with AGENTS.md, not on the memory-limited application host.
