# Issue 43 / PR 44 investigation and evidence

- Issue: https://github.com/link-foundation/meta-sovereign/issues/43
- Pull request: https://github.com/link-foundation/meta-sovereign/pull/44
- Original failing source: `9678c5f002777101f0f431cd09660ac6d2c6a009`.
- Working branch: `issue-43-1924384484c0`. No merge to the default branch is performed by this investigation.
- All timestamps below are UTC unless an original Git commit records another offset.

## Evidence and reproducibility

`github/issue.json` contains the complete issue. `github/issue-comments*.json`, `subissues*.json`, `pr-inline*.json`, `pr-conversation*.json` and `pr-reviews*.json` preserve all comment types and required-subissue discovery. Initially all were empty; subsequent conversation feedback is GitHub's informational Code Scanning setup notice. No additional acceptance criteria or required subissues have been identified.

`ci-logs/` preserves original and subsequent complete available workflow logs, plus targeted job logs where useful. `github/` preserves run timestamps, source SHAs, job/step conclusions, artifact metadata and check annotations. In-progress runs cannot expose complete logs through `gh run view`; their metadata is retained and the collector is rerun after completion. An unavailable-log text file is evidence of API/CLI refusal, not a successful test result.

`templates/{js,rust,python}/tree.json` contains each complete, non-truncated Git tree at its recorded revision. `files/` preserves workflows, helpers, hooks, root configuration/manifests, changeset configuration and regression-test references. `comparison/README.md`, `file-inventory.json`, complete-tree classifications and unified comparisons record the per-file review. See [scope and semantic decisions](comparison/REVIEW.md).

`research/` contains the referenced best-practices document, registry/advisory responses, dependency paths, upstream issue/comment evidence, link HTTP diagnostics and failure indexes. `local/` retains focused reproductions, their failing/passing results, checks, collection transcripts, commits and pushes. `artifacts/` retains every available small browser/package/link log or report artifact from collected runs, plus original documentation artifacts. GitHub digests, ZIP CRCs and independent checksums are verified; `diagnostic-inventory.json` maps every log archive to its run/source. Native installer binaries are not duplicated. Immutable evidence is excluded from product formatting, duplication, secret and CodeQL scanning; maintained source and experiment scripts remain checked.

Re-run the collectors from the repository root:

```sh
python experiments/issue43-collect.py
python experiments/issue43-compare.py
python experiments/issue43-runs.py
python experiments/issue43-verify-evidence.py
python experiments/issue43-review-ci.py RUN_ID
```

After the full run collection, `issue43-runs.py --run-id RUN_ID` can refresh selected runs; this also collects and verifies all diagnostic log/report artifacts recorded in the archive.

The reference collector reuses recorded revisions rather than silently replacing them with today's HEAD. Downloaded templates are reference material, not build fixtures. The first staged archive probe inadvertently discovered the JavaScript snapshot’s own lint-staged configuration and started its lint/format tasks before failing at missing `pipx`; automatic rollback and independent hashes confirm the snapshots are unchanged. F14 fixes configuration discovery explicitly. No downloaded template application was installed or built. After the archive was committed, unrestricted Bun discovery incidentally executed snapshot tests against this host repository; F21 records that new failure and its isolation fix. Reproductions execute local maintained helpers with fake API responses or temporary Git repositories. The Telegram resolution probe is `experiments/issue43-telegram-resolution.mjs`; it does not authenticate or contact Telegram.

## Requirements inventory

The issue asks for all CI false positives, false negatives, warnings and errors to be investigated and fixed, rather than merely making the named failed run green. The user's execution instructions add evidence, research, upstream reporting and verification duties. R-Z32 records the resulting product requirement in four languages.

| ID | Requirement, including prose instructions | Implementation / verification evidence |
| --- | --- | --- |
| A1 | Inspect all four named original workflows, including successful runs with hidden failures or warnings | Original runs 40683241777, 40688263368, 40683241643, 40683241745; logs, jobs, annotations and artifacts under this directory; analysis below |
| A2 | Read the complete issue, every comment/subissue and all three PR feedback types | `github/*comments*`, `*inline*`, `*conversation*`, `*reviews*`, `*subissues*`; only informational Code Scanning feedback, no required subissues |
| A3 | Compare full trees and every workflow/helper/configuration from JS, Rust and Python templates | Revision-pinned full trees, preserved source/config/tests, per-file hashes/diffs and `comparison/REVIEW.md`; configuration-discovery incident and corrected isolation are recorded under F14 |
| A4 | Apply every relevant principle from the linked CI/CD best-practices document | All 17 principles mapped below, including explicit product-boundary decisions |
| A5 | Find real causes, reconstruct sequence, distinguish uncertainty, propose and implement solutions | Causal findings and timeline below; unknown old external conditions explicitly retained as unknown; default-off diagnostics added |
| A6 | Search online for primary facts and existing components before inventing replacements | Research sources below; reuse actionlint, ShellCheck, pyflakes, zizmor, npm/Cargo audits, CodeQL, dependency review, Changesets, Playwright and cross-spawn |
| A7 | Write reproducing automated regressions before bug fixes | `local/*before*.log`, CI tests with real temporary Git history/API fakes, package child/health probes and sticker-render regression; passing counterparts retained |
| A8 | Repair shared faults throughout the codebase and report related upstream defects | All release helpers use the common locked loader and strict API probes; all workflows share policy checks; template, electron-builder and cifrante reports linked below |
| A9 | Keep debug/example/experiment scripts reusable in the repository | `experiments/issue43-{collect,compare,runs}.py` and `issue43-telegram-resolution.mjs`; verbose switches documented with defaults off |
| A10 | Verify without exhausting the user's machine or touching their running app | Focused tests with concurrency 1; no local full suite, stress, browser/runtime matrix or Rust build; isolated fixtures; stress and native packaging in GitHub CI |
| A11 | Commit atomic steps, retain history, merge current main, push only prepared branch, update existing PR | Git history and `local/commit-*.log`, `push-*.log`; forward merges preserve upstream recovery fixes; PR 44 retained and unmerged |
| A12 | Prepare next release and maintain product documentation in four languages | Single patch changeset referencing R-Z32; `docs/CI-OPERATIONS*.md`, CONTRIBUTING/REQUIREMENTS updates; no hand-edited package version bump |
| A13 | Inspect actual fresh CI failures, preserve logs and verify fixes on current source | `github/recent-runs.json`, complete run logs/annotations, iteration notes below and final validation record |
| A14 | Preserve every existing feature and positive closing reference | Desktop targets, Pages, docs artifacts, runtimes, provider identity, compatibility patch and all prior browser suites preserved; PR body retains `Fixes #43` |
| A15 | Eliminate every CI warning, including independently staged dependencies | Published updater candidates still depend on deprecated `lodash.isequal`; a scoped exact alias to compatible `lodash.isequalwith@4.4.0` now removes that installed path. Clean isolated installation reports zero deprecations/vulnerabilities; the actual updater cache is verified after every desktop stage. Root-lock, runtime/action and React key warnings are addressed separately; Windows DEP0190 is reproduced and every affected npm/npx launcher uses the shared escaped-command helper (F13) |

[Solution options and execution decisions](SOLUTION-DECISIONS.md) records alternatives, chosen approaches and verification plans for every causal finding and requirement group.

## Reconstructed timeline

| UTC time (2026-10-28) | Event and significance |
| --- | --- |
| 11:51:56 | Original Checks and release run **40683241777** starts for `9678c5f`; source and run IDs come from API metadata, not inference from the issue title |
| 12:11:55–12:16:57 | Packed-package check waits through installation/startup without a successful status response, then fails; log line 14513 reports `no answer from http://127.0.0.1:37331/api/status` |
| 12:18:04 | macOS Node backup case exceeds 30 seconds; lines 22539 and 26317–26318 show the exact test and timeout, while other V8 runtimes finish the same scenario |
| 12:17:39–12:29:39 | Linux WebKit step reaches its 12-minute limit; it was labelled non-gating and used `continue-on-error`, so the browser job could still appear successful |
| 12:29:00 | Original desktop run **40688263368** starts and eventually succeeds for all existing targets, with dependency/action warnings still visible |
| 12:39:34 | Issue 43 created, asking for a comprehensive audit against three templates and the 17 principles |
| 13:15:50 | First implementation run **40694834767** for `96eaf48`: package, isolated backup, Rust, both 40-suite browser engines, API docs and desktop pass. CI-only environment leakage in two detector fixtures and the Deno npm-alias/CommonJS resolution path are exposed. Link checker correctly rejects a PeoplePerHour bot challenge |
| 13:34:05 | Run **40697611350** for `cf36570`: fixture isolation, maintained real package name and CodeQL gates fixed. All four CodeQL languages pass. Runtime/browser jobs stop at a new `main` merge conflict; link gate exposes VK's live endpoint failure, previously waived by its archive |
| 13:40:24 | `f2380e8` adds strict archive unknown-state classification, publication retry classification, broader workflow policy and real-Git validated-tree tests; repairs VK documentation to a known available snapshot |
| 13:44:59 | `c317c10` merges `main` at `22e6e3e`, preserving automatic request/read/stream/media/outbox recovery and the backup timeout cleanup. Nonstress backup tests pass |
| 13:45:36 | Next CI runs start for `c317c10`; links and Pages pass. A subsequent `main` version commit and active-download fix move the merge target again |
| 13:52:32 | Runs for `8f9dd3f` validate deprecated-lockfile and sticker-key fixes, but fresh-merge jobs again detect the newly advanced default branch before executing their tests |
| Later | `main` release `f94db32` (0.54.0) and download recovery `12e2d6b` are merged; generated bundle rebuilt from merged source. Subsequent verification is recorded in the final validation section |
| 14:03–14:17 | Merge durable-host changes from `03b3c42`; migrate the installed builder's v27 schema, use its supported version CLI, distinguish unknown Git failures from proven source drift |
| 14:22:54 | Fresh workflow audit 40704515855 rejects the FPM setup's dynamic `GITHUB_ENV` write (lines 1012–1026); the security gate correctly blocks downstream jobs |
| After 14:23 | Confirm v27 ships checksummed native arm64 FPM at release `fpm@2.2.1`, remove the obsolete system workaround, reproduce/fix shell-lint selection of reference evidence and apply strict Git-state classification to versioning too. Merge the version-only `main` release 0861cd8 (0.54.1) |
| 14:30 | Run 40706524733 exposes an abrupt Windows Deno AES exit; its native desktop companion 40706524707 passes every target |
| 14:45 | `504e07d` adds verified staged-updater compatibility and bounded native/portable crypto probes |
| 14:47:57–14:47:58 | Windows Deno 2.9.8 native IGE construction exits 3221225477; identical portable probes pass all three workers, isolating a reproducible native access violation |
| 14:54 | `63177bc` applies a Windows-Deno-only portable backend selection before Telegram initialization, with regression tests and the raw native reproducer retained |
| 15:01:08 | Windows Deno completes the entire suite: 3263 passed (224 steps), 0 failed; application and portable probes both return 0, and AES-IGE comparison passes |
| By 15:11 | All four workflows pass on `63177bc`, including every runtime/native target and both 40-suite browser engines. Reviewing successful desktop logs still finds two DEP0190 warnings at lines 2450 and 3893 |
| 15:16:33 | Fresh runs start for `a8ea6a8`: all affected command paths now use the exact cross-spawn component. The old shell path reproduces DEP0190 with fatal deprecations; the shared launcher passes literal-argument, npm/npx and exit-status regressions |
| By 15:31 | All five native builds, both 40-suite browsers and eight runtime targets pass on `a8ea6a8`; Node/macOS remains unassigned in GitHub’s runner queue. Windows packaging has no runtime/dependency deprecations |
| 15:34–15:39 | Staged-archive validation discovers closest-package lint-staged task selection; it fails at missing pipx and rolls back. Reference hashes remain intact. A real-Git regression fails before the explicit-root-config fix and passes afterward on Node/Deno |
| 15:37:10 | Earlier Node/macOS job ends without any steps: GitHub reports no hosted runner acquired and macOS arm64 capacity constraints. The required terminal gate fails the incomplete matrix |
| 15:39:34 | `f91758c` starts fresh verification with root hook configuration pinned. Earlier queued source is superseded; the subsequent F15/F16 iteration supersedes this revision |
| 15:44–15:53 | `f91758c` Windows Deno spends two separate 2m59s waits in GitHub fixture cases, then reaches the unchanged ten-minute job deadline; its hook regression already passed. Raw log and timestamp-gap analysis isolate teardown waits, not crypto or command-shim failures |
| 15:57–15:59 | WebKit and Node/macOS again end without a runner or any executed steps. GitHub annotates hosted-runner acquisition failure and ARM capacity constraints; the terminal gate fails correctly |
| 15:59:52 | `688ff75` fixes the shared GitHub fixture to close owned sockets; a 500ms incomplete-request regression fails before and passes after, with Node/Deno focused coverage and default-off teardown diagnostics |
| 16:00:46–16:00:59 | `cf236dc` selects GitHub's pinned native Intel pool for Node/macOS and WebKit while retaining Bun/Deno and desktop ARM coverage; all four verification workflows start |
| 16:08:57 | `ee0b960` fixes two actual warnings found in successful logs: Rustdoc bare URL and inherited LF/CRLF conversion in the owned hook fixture. Before/after probes reproduce both, and all three documentation paths now reject warnings |
| 16:13 | Forward merge `bada0cb` incorporates `main` at `7630669`, preserving observed message edits/history and adding its new browser suite to both required engines (41 suites each) |
| 16:16:41 | `c086c8f` starts new verification after extending owned-connection shutdown to every HTTP/TCP/TLS fixture. The previous Windows Deno run now passes 3268 tests, but exposed another three-minute server-fetch teardown; focused TCP/HTTP regressions reproduce the common fault before the shared fix |
| 16:25:55 | Windows Deno passes 3279 tests / 224 steps in 3m16s; the server-fetch case takes 133ms and both new shutdown regressions pass. Full trace contains no LF/CRLF warnings |
| 16:27:00 | Forward merge `2d42df9` incorporates main `fbf377b`, retaining single-write failure semantics for message history; 19 focused message-version/store-append cases pass |

| 16:27:47–16:30:47 | Native WebKit run 40724371995 reports one missing tutorial card on the phone viewport. The suite and terminal gate fail; Chromium and the remaining 40 WebKit suites pass. The assertion omitted its expected step and did not retain a screenshot |
| 16:42:05 | `6526815` preserves tutorial step/input diagnostics and logical-failure screenshots, opts CI into tracing, and starts fresh verification including the latest main recovery merge |

| After archive commit `5051e0e` | Forward merge `28e6b6f` incorporates main release `a58fdab` (0.55.0), retaining this PR’s pending patch changeset. Final review reproduces four false-green skip spellings and fixes their common aggregate gate (F20) |

The first prepared branch run was superseded/cancelled rather than treated as an application failure. Read-only cancellation is expected when a newer source revision arrives; release writes use a separate non-cancelling concurrency policy. A stale passing run never substitutes for a newer failing run.

## Causal findings and solutions

### F1. Package startup failure lacked the data needed to separate installation and startup

Observed fact: the original package run failed after roughly five minutes with only a generic “no answer” message (`ci-logs/checks-40683241777.log`, line 14513). It ran an `npx` cold install and server startup in the same phase, with polling unable to identify an exited child promptly. The old logs do **not** prove that the registry was slow, that a particular install command hung, or that the application listener failed. A subsequent cold-cache package probe can succeed and still cannot reconstruct that missing historical fact.

The test architecture was the actionable root cause of the opaque timeout: installation had no independently reported completion and child/network failures could consume the entire polling period. The solution keeps the cold-cache test, separates install/start, bounds health requests and startup, detects child exit, and retains npm diagnostics and the final child output. `ci-helpers.test.js` reproduces exited-child and never-resolving-request cases with fakes. `pack-smoke.mjs` verifies the actual packed CLI and local fixture. An implementation draft omitted the hosted Origin header, exposing the expected HTTPS redirect; that header was restored before the successful package runs.

If the original external stall recurs, `PACK_SMOKE_VERBOSE=1` and `artifacts/pack/` now distinguish install progress, exit status and HTTP startup. Default verbosity stays off. This fixes the diagnostic/deadline defect without claiming an unproved registry repair.

### F2. Resource-heavy backup regression ran inside the ordinary matrix

The original 200k-link test generated, encrypted and restored tens of megabytes under a 30-second per-test cap. The macOS trace includes successful compression progress before the deadline, so this is not evidence of infinite recursion or a broken backup format. Node's file concurrency defaults to available CPUs, making many competing fixture processes an avoidable source of runtime variance.

Keep the memory assertion and entire scenario, run it in a dedicated CI job with a bounded 384 MiB heap and 120-second test deadline, skip it in normal matrix runs, and limit Node unit-file concurrency to two. A cleanup `finally` clears the forced-GC sampler on failure. The matching independent `main` fix was retained during merge. The isolated stress job passes in repeated CI runs; focused nonstress backup tests pass locally (13 passed, one intentional stress skip). No local stress experiment was run.

### F3. Linux WebKit failures were explicitly hidden

The old workflow's WebKit step used `continue-on-error: true` and a “non-gating” label. The original trace contains interaction/scroll diagnostics followed by a 12-minute timeout at line 12099, while the job's final success concealed that failed step. This is a proven aggregation defect. The underlying old Linux/WebKit click/render stall cannot be conclusively reconstructed without a trace or screenshot from that instant.

Both Chromium and native macOS WebKit now run the same union of all 40 previously selected suites, including recovery, plus the message-version suite added by the latest main merge (41 total). Each suite has a finite 180-second budget, 16 MiB output cap and saved log; the summary reports every failure. Missing requested Playwright is an error, never a green skip. The SPA smoke stops cascading after its first failing interaction and saves diagnostics. Mandatory browser jobs feed the terminal release gate. The first full CI implementation run passed both engines. This deliberately selects native WebKit; it does not claim that Linux WebKit itself has been repaired. `CI_BROWSER_DEBUG=1` enables Playwright API traces for a future failure.

### F4. Whole-change detection and maintained-file coverage had false negatives

The original detector inspected the latest commit, so a final docs-only commit could hide earlier code changes. Git failures became empty change lists. Rust/workflow/helper paths were incompletely classified. Syntax checking traversed only top-level `.mjs`; line limits missed several maintained languages/workflows.

Detection now compares the complete PR base/head or push before/after range, handles manual inventory and rename paths, and fails closed on invalid history. Five temporary-Git fixtures reproduce these conditions. Their subprocess environment explicitly clears inherited PR event variables; the initial CI failure established why local-only fixture environments were insufficient. Syntax and line-limit checks enumerate tracked maintained files recursively, with tests for nested malformed JavaScript. Reference data and case-study evidence are intentionally outside product-check scope.

### F5. Link archives and missing reports falsely implied success

A successful redirect was previously mistaken for a failed URL; non-HTTP errors could disappear from parsing; a missing report could set `all_archived=true`; an existing archive could waive a broken source URL. A Wayback rate limit or malformed JSON was liable to be described as “no archive.” The missing-report branch exists in all three pinned templates and was reported to each.

Only failed HTTP entries are sent to archive lookup. Missing reports throw; a failed checker with no usable HTTP entries still fails. Wayback distinguishes available, missing and unknown, with fake-response regressions. Regardless of archive availability, the workflow independently fails on a nonzero source-check result and preserves its report. Thus mixed/unrecognized report entries cannot turn a source failure green. An archive is a repair suggestion.

This stricter gate exposed two actual circumstances: PeoplePerHour's exact help article returns a verified Cloudflare challenge to bots, while VK's live API-reference URL returned an error in CI. The former has a narrowly documented exact-URL exclusion (not a domain/status wildcard); the latter was repaired in all four VK pages using the available Wayback snapshot. Subsequent link runs pass. No general `500`/`403` suppression was added.

### F6. Release helpers loaded mutable remote code and could swallow command failure

Nine CI/release helpers fetched/evaluated unpinned remote module contents. Module export shapes differed across ESM/CommonJS/runtime combinations. `command-stream` did not reject nonzero commands unless configured.

All callers use a common local loader with exact locked dependencies, explicit export normalization and `shell.errexit(true)`. Tests exercise nested CommonJS shapes, unsupported modules and a real subprocess exit 7. Optional loader diagnostics use `CISCRIPTS_DEBUG=1`/GitHub debugging flags and remain off by default. No runtime download/eval fallback remains.

### F7. Registry/API uncertainty could authorize release work

Treating any npm/GitHub probe error as “unpublished” conflates 404 absence with authentication refusal, rate limiting, bad JSON and network failure. A missing GitHub release after successful npm publication also had no reliable recovery path.

Strict shared probes accept only exact version metadata or explicit npm E404/GitHub 404, validate GitHub tag/assets shape and apply finite request budgets. Authentication and malformed/unknown results fail. Publication classifies actual npm output, retries only known transient transport/server failures and uses one shared visibility deadline. A staged version is polled without another upload. Permission/policy/unknown errors stop. Tests cover each classification. Existing npm versions can recreate a missing GitHub release and attach rebuilt documentation without republishing npm.

### F8. The source could change after validation but before publication

Unrestricted pull/staging and checking out `main` at publication time allowed source/dependencies to advance beyond the validated commit. A successful earlier CI run was not proof of the later tree.

A common Git-tree guard permits only version/changelog/changeset metadata differences, checks package and lockfile JSON after removing only release-version fields, and rejects source/dependency edits. It protects versioning, optional publishing pulls and desktop source resolution. Only a proven tree difference can skip a superseded run; missing revisions, invalid JSON and other unknown Git failures fail. The CLI reserves exit 2 for proven source drift and exit 1 for unknown errors; versioning uses the same classification. Release staging is explicit rather than `git add -A`. Real temporary-Git tests prove version-only acceptance, source/dependency rejection and unknown-state failure. Desktop GitHub writes require a validated `main` source and the appropriate gated workflow context. All existing desktop artifact formats/update feeds remain configured.

### F9. Security/workflow policy gaps and mutable infrastructure produced avoidable risk and warnings

The comparison found no dedicated workflow linter/security policy, missing committed-lock audits, broad write permissions, implicit stored checkout credentials, unpinned third-party action revisions and mutable OS labels. Old action runtimes emitted `punycode`/Node deprecation warnings.

Workflows now use least default read privilege, isolated writers, credential-free checkout, supported pinned OS images, current official action majors and pinned third-party actions. Pinned actionlint's container includes ShellCheck and pyflakes; standalone scripts/hooks are checked as well. Pinned zizmor runs offline, with narrow documented scope handling rather than globally disabled audits. Every job has a deadline; contract tests detect mutable matrix runners and unbounded auxiliary jobs. The terminal release gate enumerates every check and rejects failed/cancelled/missing states, so adding a new ungated check fails the contract.

Committed-lock npm and Cargo audits, four-language CodeQL (JS/TS, Python, Rust, Actions), and capability-aware dependency review now run. All four CodeQL analyses passed the second implementation run. npm publisher/dependency graph checks run before expensive work; PRs need no publishing secrets. Missing administrator setup fails `main` explicitly, while API outages remain errors.

### F10. Actual vulnerable/deprecated dependencies and install-script warnings

The initial audit found the KaTeX advisory documented in `research/npm-audit-initial.json`. Updating KaTeX to 0.19.1 removes it. The old GramJS dependency brought the deprecated `yaeti` chain; the maintained `teleproto@1.232.0` replacement keeps provider identity `telegram`, the project's compatibility layer and transport behavior. Deno does not safely resolve this package through an arbitrary npm alias in nested CommonJS imports; using its real package name/import map plus one CommonJS Api/BinaryReader identity fixes that path. Focused Node and Deno Telegram tests pass; the full matrix verifies integration.

Four remaining deprecations (`boolean`, `glob@7`, `inflight`, `rimraf@2`) were traced to electron-builder 26.x, not confused with current npm security advisories. Registry manifests show that 26.18.1 retains them. The existing upstream issue documents the completed v27 migrations; exactly 27.0.0-alpha.13 removes all deprecated lockfile entries and the old Windows installer dependency. This is a prerelease development tool and must pass all five native packaging targets; blindly overriding transitive major versions is incompatible with old callback/CommonJS APIs. A lockfile regression fails on any deprecated registry entry. The new lock's npm audit reports zero vulnerabilities.

Reviewed native scripts (`better-sqlite3`, `esbuild`, `node-pty`) are explicitly allowed for npm, Bun and Deno. Deno runs its install phase before tests. No broad “trust all scripts” or warning suppression is used. The CI React warning was separately reproduced by rendering static/video stickers; both unkeyed media branches now have stable keys, and a focused SSR test proves no React errors without changing markup.

The separately staged desktop updater is outside the root lockfile. Registry manifests and install logs establish that updater 6.8.11, 6.8.12 and 7.0.0-alpha.12 still depend on deprecated `lodash.isequal`; builder upgrades alone cannot repair it. Further investigation found a compatible exact scoped alias to `lodash.isequalwith@4.4.0`, preserving the actual two-argument boolean contract. Clean isolated and real staged installs have no deprecated entries/warnings, and the installed updater cache passes cloned/changed metadata and missing-file checks. This criterion is resolved locally; the original failed candidates and upstream follow-ups remain evidence. See the detailed compatibility investigation below.

### F11. Builder migration required schema, tooling and signing compatibility changes

Native CI rejected removed v26 configuration keys under v27. Focused regressions failed before migration; the installed builder's actual schema now accepts the configuration. File selection moved to `fileOptions.files`, native-module policy to `nativeModules`, and macOS signing fields to `mac.sign`; the obsolete desktop-entry switch was removed while preserving its name. Supported `electron-builder --version` replaces a package.json import blocked by v27's exports map. Capturing its exit code before echo prevents a failed provenance probe from printing success.

The old `USE_SYSTEM_FPM` workaround is rejected by v27. An intermediate custom-toolset migration exposed a dynamic environment-file write, correctly caught by zizmor. Primary source and the published checksum/digest inventory prove v27 includes native Linux arm64 FPM, so the final solution removes apt/gem installation and uses the checksummed native bundle. `research/fpm-native-bundles.json` records the release/assets. The deprecated system override, custom path and environment write are all absent from the final workflow.

The existing updater-6 channel explicitly keeps unsigned update manifests and unsigned Windows artifacts; enabling signature verification requires a configured signing publisher. These settings preserve the channel's existing behavior through v27's stricter defaults. They do not claim signed updates or notarization without credentials. All five native targets and existing smoke checks remain required; the prerelease build-tool pin is a documented validation risk.

Review also reproduced a maintained-source scope bug: after committing the evidence tree, standalone ShellCheck would select downloaded template shell scripts. The Git selection now excludes only immutable evidence/case-study paths and still includes actual scripts/hooks. A temporary-repository regression verifies both inclusion and exclusion. Reference code remains unexecuted.


### F12. Maintained crypto dependency selected a crashing Windows Deno native backend

The full Windows Deno job first ended at the AES comparison without an assertion (`ci-logs/deno-windows-40706524733.log`, lines 4141–4142). The bounded probe supplied the missing evidence: in `ci-logs/deno-windows-40709046923-live.log`, lines **1742–1748** show native construction exiting **3221225477 / 0xC0000005** before encryption; lines **1749–1782** show the same 144-byte portable round trips passing in all three workers with backend `wasm`. Deno is 2.9.8 on Windows x64. This proves the native addon boundary is unsafe in this runtime; it does not identify the exact invalid access inside the binary or assign ownership to Deno versus cifrante without native symbols.

The existing `CIFRANTE_NATIVE=0` switch is read before the addon is first initialized. `telegram-runtime.js` selects it specifically for Windows Deno, called before the application's centralized Telegram load and the direct crypto reference test. Native selection/explicit settings elsewhere remain intact. A JavaScript catch cannot recover from this process-level fault. The new selector regression fails before implementation and passes afterward; Windows CI run 40710572359 now passes both application/portable probes and the full Deno suite; the successful job log is retained beside the crash reproduction. Default-off stage tracing remains available, and `experiments/issue43-cifrante.mjs --raw-native` preserves the original bounded crash reproduction. No runtime or crypto comparison is removed. [Upstream report](https://github.com/sanyok12345/cifrante/issues/1) includes the reproduction, workaround, code proposal and ownership limits.

### F13. Windows command shims used Node’s deprecated unescaped shell argument path

Even successful native run 40710572356 emits DEP0190 at `ci-logs/workflow-40710572356.log` lines **2450 and 3893**. `prepare-desktop.mjs` passed an argument array to `execFileSync` with `shell: true` on Windows to resolve npm.cmd. Node 24+ deprecates that combination because it joins arguments without escaping. The same pattern existed in build, registry, mobile and package smoke commands; the npm setup helper also directly invoked the Windows shim without resolving it safely.

The finite `experiments/issue43-shell-arguments.mjs` reproduces the old failure with `--throw-deprecation` and then runs the replacement successfully (`local/command-process-deprecation-probe.log`). A missing-helper regression precedes implementation (`local/command-process-before.log`). Existing locked `cross-spawn@7.0.6` already handles Windows PATHEXT, npm/npx shims and argument escaping. It is now an exact direct development dependency and a common `command-process.mjs` wrapper uses `shell: false`. The component resolves a command shim and escapes arguments itself before directly spawning cmd.exe; no warning flag or manual command concatenation is added. The wrapper preserves stdout, errors, nonzero statuses and asynchronous child behavior.

Every affected maintained caller, including reusable experiments, is migrated. Three focused tests cover literal spaces/quotes/metacharacters, real npm/npx with fatal deprecations, synchronous failure and asynchronous exit status. Node’s focused desktop/helper group reports **31 passing tests**, Deno’s focused group reports **3 passing tests**, and the additional CI/release-tree contracts report **18 passing tests**. Changed-file lint, formatting, offline workflow security and the audit pass. Full runtime/OS, native packaging and package smoke remain CI requirements. `research/node-dep0190.md`, exact component source/metadata and `command-process-sources.json` preserve primary documentation and provenance. This is a local caller defect; no upstream issue is filed against a component correctly escaping its commands.

### F14. Pre-commit configuration discovery escaped the archive exclusion policy

Root ESLint/Prettier ignores alone do not control lint-staged’s configuration search. Staging the complete evidence tree reproduced a new failure: `local/archive-staged-checks.log` lines 6–41 show the closest JavaScript snapshot `package.json` supplying its own tasks, including a `pipx` command unavailable here. Some nested lint/format tasks started before the failure; lint-staged then restored its backup. `local/archive-integrity-after-hook.log` independently verifies all 356 original reference hashes and artifact checksums after rollback. This incidental execution of downloaded lint configuration is preserved honestly; the snapshots were not used as application/build fixtures.

The root hook now passes `--config package.json`, disabling nearest-package discovery according to lint-staged’s documented flag contract. The root ignore policy still excludes evidence, while maintained files retain normal checks. `ci-precommit.test.js` creates an owned temporary Git fixture with both a root task and a nested reference task that throws. It executes the real hook’s argument list using the installed CLI: before the fix it fails by running the nested task; afterward it verifies successful root checks for both staged paths. Node and Deno focused runs pass, with no network, downloaded application execution or real user data. The JavaScript template has the same unqualified hook and receives a reproducible report; lint-staged itself is behaving as documented, not blamed for its intended monorepo discovery semantics.


### F15. Shared GitHub fixture teardown waited for its clients

The `f91758c` Windows Deno log records two successive **2m59s** waits in GitHub inbox cases at `ci-logs/deno-windows-40718185645.log` lines **3225–3250**, before cancellation at line **5789**. The hook regression passed at lines **2472–2484**; the native AES failure was already fixed. `research/f91758c-deno-windows-gaps.json` preserves timestamp differences rather than attributing every delay to an assertion.

The shared fake used only `server.close(callback)`, which can wait for a client that still holds an active/incomplete request. A minimal owned loopback regression sends valid headers with an unfinished one-byte body and asks the fixture to close within 500ms. It fails before the fix (`local/fixture-close-before.log`) and succeeds after. The fixture now tracks and destroys only its own sockets after it stops accepting connections. Production server shutdown already tracks its own sockets; no application server is terminated by the fixture.

`local/fixture-close-after.log` records **31 focused Node tests**, and `fixture-close-deno.log` records **8 Deno suites / 30 steps** passing. The additional `fixture-close-{debug,deno-debug}.log` files verify optional `CI_FIXTURE_DEBUG=1` connection-count/duration output; it is off by default and contains no URLs or user data. The job timeout remains ten minutes. A portable fixture ownership defect is reproduced; an underlying Deno implementation defect is not established, so no speculative upstream report is filed. The next Windows Deno run passes **3268 tests / 224 steps** (`ci-logs/deno-windows-40721747791.log`), with the two GitHub stalls eliminated. It also reveals the same three-minute wait in `web-server-fetch`, so the fix is extended throughout the codebase rather than raising its deadline.

`js/tests/helpers/fixture-server.mjs` now owns connection tracking and idempotent shutdown for the GitHub, server-fetch, archive, WhatsApp, marketplace, mail/TLS/raw-protocol and Pages fixtures. It registers before listening and destroys only accepted fixture sockets after stopping the listener. Two bounded TCP/HTTP regressions fail before this shared implementation (`local/all-fixture-shutdown-before.log`). The fix passes **50 focused Node tests**, **34 Deno tests / 50 steps**, and **20 additional Node mail-security tests**; `local/all-fixture-debug.log` records the server-fetch fixture closing two connections in 3ms. The scope inventory is refreshed in `research/fixture-shutdown-inventory.txt`. No runtime case, assertion or production server is removed. Current-source Windows Deno verifies the complete extension: `ci-logs/deno-windows-40724371995.log` lines **3193–3194** pass TCP/HTTP shutdown in 8/14ms; line **5804** passes server-fetch in **133ms**; line **5856** reports **3279 passed / 224 steps, zero failures**, with suite time **3m16s** instead of 6m18s. No LF/CRLF warnings recur. The actual Rustdoc log `ci-logs/docs-40724371995.log` builds all three crates with warnings denied and no emitted warning.

### F16. GitHub macOS ARM capacity prevented required checks from starting

Two consecutive final-product attempts contain jobs with no steps or runner. Check annotations preserve GitHub's hosted-runner acquisition failure and ARM capacity notices: earlier Node/macOS in run **40714282555**, followed by WebKit and Node/macOS in **40718185645**. The required terminal gate correctly rejects these incomplete matrices. Neither a passing older revision nor a green native packaging job certifies an unexecuted browser/runtime target.

GitHub's current primary runner table lists `macos-15-intel` as a standard native Intel macOS pool, distinct from ARM `macos-15`. Node/macOS and WebKit now use that pinned pool, while Bun/Deno and native desktop packaging retain ARM coverage. The matrix still has exactly nine runtime/OS combinations and both engines still run the full same manifest (41 suites after the message-history main merge). This mitigates a repeated allocation failure without deleting a check, emulating macOS, or relaxing the terminal gate. `research/github-runner-pools.md` records the primary source and retained coverage. The existing focused workflow contracts, policy validator, pinned actionlint and formatting all pass; actual pool availability is verified by fresh CI, not assumed from the documentation.


### F17. Rust documentation warnings did not fail CI

The successful API-doc job in `f91758c` prints a real `rustdoc::bare_urls` warning at `ci-logs/job-122922801331.log` lines **433–446**. `rust/crates/meta-sovereign-server/src/main.rs:6` used a bare URL rather than a Markdown automatic link. This is an actual emitted warning, distinct from CodeQL printing schema descriptions of deprecated options or a test name mentioning deprecation.

The comment now uses an automatic link. Workflow-level `RUSTDOCFLAGS=-D warnings` covers the normal API-doc job and both release documentation paths. A contract enumerates every `cargo doc` step and checks its effective inherited flags: it fails before implementation (`local/rustdoc-warning-before.log`) and passes afterward. The source comment passes focused rustfmt; actual crate documentation is rebuilt on GitHub, preserving the local memory/validation constraint. No lint suppression is added.

### F18. The new temporary-Git hook fixture inherited Windows line conversion

Node, Bun and Deno Windows jobs emitted LF-to-CRLF warnings from the owned `ci-precommit` fixture. Example: `ci-logs/job-122922801516.log` lines **902–907**. The fixture writes LF files but inherited the runner's global `core.autocrlf=true` policy. This warning is independent of the nested-hook discovery defect.

`experiments/issue43-precommit-crlf.mjs` supplies an isolated temporary global config with that Windows setting, executes only the hook regression, and asserts that line-conversion warnings are absent. It fails before the fix (`local/precommit-crlf-before.log`) and passes afterward. The fixture now sets `core.autocrlf=false` only in its own temporary repository before adding files. It changes neither user settings nor product checkout policy, and does not disable Git warning output. The probe remains reusable; focused Node/Deno checks and all maintained-file quality gates still apply.

### F19. A tutorial logical assertion did not preserve enough failure context

Native macOS WebKit in run **40724371995** fails one phone assertion: `ci-logs/webkit-40724371995.log` line **971** reports a missing card with a null step/side (full-workflow line **25439**). The other 40 suites pass; Chromium passes all 41. This is a real failed assertion, not a passing or skipped browser result. The accumulated assertion did not throw, so the exception-only screenshot path never ran. Most walkthrough placement assertions also reused a viewport-only label. The historical artifact therefore cannot identify which step disappeared, and does not prove a product race or rendering root cause.

`6526815` retains the expected step in walkthrough labels, captures missing-card screenshots in the uploaded artifact directory, and adds opt-in `CI_TUTORIAL_DEBUG=1` transition/input tracing, bounded to recent interaction events. The failure probe records the saved tutorial preference as well as hit/frame geometry. Ordinary runs keep tracing off; the owned CI fixture opts in. `E2E_VIEWPORTS` supports a focused reproduction and rejects an empty selection. No assertion, browser engine, viewport or deadline was removed or relaxed.

A local Linux WebKit phone probe stalled before a result and was terminated after roughly four minutes; `local/tutorial-phone-before.log` and `tutorial-local-memory-processes.txt` retain that limitation. It does not certify native macOS behavior. A separate isolated Playwright MCP Chromium phone walkthrough passes Back, provider selection, Contacts, Chat, Automation, Backup and Escape. Its screenshot is `local/tutorial-phone-chromium.png`; browser and temporary server are closed afterward. This manual pass is not a reproduction of the historical WebKit failure. Fresh native WebKit CI must be reviewed, and the original disappearing-card cause remains explicitly unproved unless new evidence establishes it.

### F20. Required browser suites could report a skip as success

The runner rejected only the exact text `SKIP: playwright not installed`. Actual maintained suites also emit `SKIP: playwright is not installed`, `SKIP: no Playwright browser is installed`, `webkit not installed, skipped`, and the explicit-opt-in skip. Their zero exit status could therefore certify an unexecuted mandatory suite. This affects the shared runner for the entire 41-suite manifest, not only Tutorial.

Six owned temporary fixtures execute the real runner against one finite fake suite; they do not launch browsers or run the matrix. Before the fix, the success control and exact old spelling pass, but all four alternative skip cases incorrectly exit zero (`local/browser-skip-gate-before.log`). The runner now rejects all `SKIP:` markers and the engine-unavailable marker in addition to nonzero/terminated child results. All **14 Node contracts** and **six selected Deno cases** pass afterward; lint/format pass. Local opt-in behavior of the individual scripts remains available, while the mandatory aggregate cannot call a skipped suite successful. The flaw was in this PR's shared runner, so it is not attributed to an upstream template.

## All 17 best-practice principles

Source is preserved as `research/CI-CD-BEST-PRACTICES.md`; primary upstream page: https://github.com/link-assistant/hive-mind/blob/main/docs/CI-CD-BEST-PRACTICES.md.

| # | Principle | Applied decision and evidence |
| --- | --- | --- |
| 1 | Relevant changes only | Complete event ranges, explicit language/workflow/docs outputs, tracked manual inventory; evidence-only changes do not rebuild the app |
| 2 | File size limits | Recursive maintained-language/workflow checks; ESLint limits retained; immutable evidence excluded |
| 3 | Automated formatting | Prettier/pre-commit retained; changed-file local checks; complete formatting gate in CI |
| 4 | Static analysis/lint | ESLint, syntax checks, actionlint/ShellCheck/pyflakes, zizmor, Rust fmt/clippy, four-language CodeQL |
| 5 | Fast failure ordering | Preflight and fast lint/changeset/version/workflow gates precede expensive matrix/browser/build jobs |
| 6 | Changeset versions | Existing Changesets automation retained; one patch changeset with R-Z32; no manual version bump |
| 7 | Actual merge result | Existing fresh-merge simulation retained and extended to browsers; real conflicts caught twice and resolved by merging current main; release-tree guard prevents later source drift |
| 8 | Pre-commit hooks | Existing Husky/lint-staged quality gates retained; explicit root configuration prevents archived nested task discovery, with real-Git regression and staged-archive verification |
| 9 | Automated release | Existing npm/GitHub/desktop/Pages/docs features retained; strict probes, recovery, scoped staging and validated source |
| 10 | Concurrency | Superseded read-only jobs can cancel; release write queues do not cancel each other; stress and unit concurrency separated |
| 11 | Secrets | Secretlint retained; credentials scoped to writers; verbose output never includes authenticated user data; immutable public-reference/log evidence not treated as product source |
| 12 | Documentation | Four-language CI operations/requirements, required-document checks, line limits, API docs artifacts and honest link gate |
| 13 | Native architecture images | This project does not publish a container image. No new registry/channel is invented. Existing desktop Linux/macOS architectures use native runners; no QEMU matrix added |
| 14 | Workflow linting | Pinned actionlint container, standalone ShellCheck, pyflakes and zizmor; executable gate/runner/deadline/checkout contracts |
| 15 | Dependency auditing | npm committed-lock audit and Cargo audit with warnings denied, scheduled workflow, fixed KaTeX, maintained client, deprecation regression, capability-aware dependency review |
| 16 | Publish feasibility first | Actual npm OIDC exchange, dependency graph capability and least-privilege checks before expensive main builds; actionable main failures for missing administrator configuration |
| 17 | Broken pipeline vs changed world | Strict 404 vs unknown states, explicit transient/permanent retry policy, shared deadlines, failed/missing report gates and durable install/browser diagnostics; external uncertainty never means absence/success |

## Primary research and reusable components

- [Rustdoc lints](https://doc.rust-lang.org/rustdoc/lints.html#bare_urls) and [Cargo environment variables](https://doc.rust-lang.org/cargo/reference/environment-variables.html): automatic links remove the bare-URL warning; RUSTDOCFLAGS applies warning denial across documentation builds.
- [Git line-ending policy](https://git-scm.com/docs/gitattributes): owned LF fixture files should not inherit global Windows conversion policy.

- [GitHub hosted runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): supported native Intel and ARM macOS pools; required target coverage is retained when moving two repeatedly unallocated jobs.
- [Node HTTP shutdown](https://nodejs.org/api/http.html#serverclosecallback): active connections can outlive listener closure; fixture ownership must include its sockets.

- [lint-staged configuration](https://github.com/lint-staged/lint-staged#--config-path): explicit config disables discovery; root ESLint/Prettier exclusions cannot prevent closest-package task selection by themselves.
- [Node DEP0190](https://nodejs.org/api/deprecations.html#dep0190-passing-args-to-nodechild_process-execfilespawn-with-shell-option-true) and [cross-spawn](https://github.com/moxystudio/node-cross-spawn): deprecated unescaped shell argument arrays and the existing tested Windows shim/escaping component; pinned source and before/after probe retained.
- [Node test runner concurrency](https://nodejs.org/api/test.html): file concurrency and per-test deadlines; informed isolated stress validation rather than treating the heavy case as an ordinary fast unit.
- [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec): package/cache installation semantics; explains why an `npx` startup probe needs a visible installation phase.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): OIDC prerequisites, workflow identity, npm minimum and package bootstrap; no legacy-token fallback added.
- [npm install script policy](https://docs.npmjs.com/cli/using-npm/config/): project `allowScripts` versus global/one-off flags; exact reviewed approvals recorded.
- [Bun lifecycle scripts](https://bun.sh/docs/pm/lifecycle): explicit trustedDependencies replaces the default list; the project lists every required native script dependency.
- [Deno lifecycle scripts](https://docs.deno.com/examples/npm_lifecycle_scripts_tutorial/) and [Node compatibility](https://docs.deno.com/runtime/fundamentals/node/): explicit script approvals and npm/CommonJS resolution requirements; real package identity avoids an alias-only resolution failure.
- [Teleproto migration](https://docs.teleproto.dev/migrating-from-gramjs): maintained compatible client considered before replacing Telegram APIs with bespoke code.
- [KaTeX advisory](https://github.com/advisories/GHSA-238p-pmpm-9mq7): patched release requirement; exact audit responses retained.
- [actionlint](https://github.com/rhysd/actionlint), [zizmor](https://docs.zizmor.sh/), [CodeQL build modes](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning/codeql-code-scanning-for-compiled-languages): use maintained tools, including Rust analysis without local host compilation.
- [Dependency review action](https://github.com/actions/dependency-review-action): requires dependency graph capability; committed-lock audits remain mandatory when a PR lacks it.
- [Electron-builder upstream discussion](https://github.com/electron-userland/electron-builder/issues/10016) and [Squirrel migration](https://github.com/electron-userland/electron-builder/pull/9830): concrete dependency-tree fix; pin and native packaging validation rather than incompatible blanket overrides.

These sources were used as primary technical references, not as proof that a local implementation passes. The commands, fixtures and fresh GitHub CI supply that proof.

## Upstream reports

Each new template report includes the pinned revision, minimal nonexistent-report reproduction, expected/actual result, workflow workaround and suggested throw/nonzero regression fix:

- https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/267
- https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/268 (archived nested hook configuration discovery; documented root-config workaround and real-Git regression)
- https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/issues/220
- https://github.com/link-foundation/python-ai-driven-development-pipeline-template/issues/123

The already-open electron-builder report received current 26.18.x dependency paths, reproducible npm commands, safe workaround limits and a proposed compatible/backported migration:

- https://github.com/electron-userland/electron-builder/issues/10016#issuecomment-6470762649
- https://github.com/electron-userland/electron-builder/issues/10016#issuecomment-6471259573 (initial independent updater deprecation evidence)
- https://github.com/electron-userland/electron-builder/issues/10016#issuecomment-6472315403 (verified compatible scoped alias and actual cache regression)
- https://github.com/sanyok12345/cifrante/issues/1 (Windows Deno native access violation; bounded reproduction and portable workaround)

No new issue was filed merely because an external API returned a temporary status without a reproducible upstream code defect. Template-specific npm/crates.io/PyPI publishing and demonstration apps are compared but are not imported as new product features.

## Verification and remaining limits

See `VALIDATION.md` for the latest verified source, complete workflow results and any still-open criteria. Intermediate passing workflows are not substituted for final-source checks. No production npm/GitHub release is triggered from this PR; publishing-state tests use fake API/registry responses and real temporary Git fixtures. Administrator setup and real OIDC publishing can only be fully exercised in the configured trusted main workflow.

The original opaque package stall and historical Linux WebKit rendering stall lack enough evidence to name a deeper external cause. Their proven pipeline/diagnostic defects are fixed; opt-in diagnostics and preserved artifacts support a subsequent investigation if those circumstances recur. These limits are explicit rather than presented as known repaired upstream defects.

## Final updater compatibility investigation

The initial evidence correctly showed that every published updater candidate still uses `lodash.isequal`; upgrading only the builder could not remove the warning. Further primary-source/npm research identified `lodash.isequalwith@4.4.0`, whose optional third customizer argument is absent in both updater calls. Its default export returns the actual deep-comparison boolean, preserving the two-argument contract. Unlike aliasing the entire lodash library, this does not substitute a truthy wrapper.

A finite isolated install experiment (`experiments/issue43-updater-alias.mjs`) scopes the exact npm override only to electron-updater and inspects actual resolution. `local/updater-alias-probe.log` records 16 installed packages, zero vulnerabilities, no deprecated lock entries and real `DownloadedUpdateHelper` cache behavior. `local/updater-alias-before.log` records the failing contract before implementation. `local/updater-staged-after.log` verifies the actual staged application after the fix, without suppression of npm warnings. Each real desktop build now validates cloned metadata, changed version/checksum/release notes, optional properties and a missing download using the installed updater helper. Remove the pinned compatibility override when upstream ships its comparator replacement.

The subsequent Windows Deno failure is now isolated and repaired at the application boundary (F12), rather than left as an unexplained exit. Raw native crash evidence and the unsupported-platform ownership limits remain explicit. The complete runtime matrix, crypto comparisons and both portable/application probes remain required.


### F21. Bun discovered archived template tests as maintained product tests

The first complete post-archive run, **40730466733** on `6266e2e`, passes the six aggregate-browser contracts but fails all three Bun legs by discovering `dev/log/.../templates/js/files/tests/*.test.js`. Linux job **122969274732** lines **3174–3179** show the new contracts passing; lines **5281–5303** identify the foreign universal-app tests and their missing host-relative example files. Both downloaded job logs are retained as `ci-logs/bun-discovery-{linux,windows}-40730466733.log`. This is a new archive-discovery fault, not a failed skip-gate fix or a Bun runtime defect.

The root `bunfig.toml` had only an obsolete comment claiming exclusion was unsupported, so `bun test --timeout 30000` recursively searched the checkout. Root ESLint/Prettier/hook exclusions do not affect Bun discovery. Official Bun documentation supports `[test] root`; Node and Deno already select `js/tests`. The tracked-file inventory confirms every maintained JavaScript test is inside that directory.

`ci-test-discovery.test.js` copies the actual Bun configuration into an owned temporary fixture with one maintained test and throwing sentinels in `dev/log/reference` and `dist`. The bounded child runs only those three tiny files: before the fix it executes both sentinels and fails (`local/bun-discovery-before.log`); afterward it runs only the maintained test. Root `[test] root = "./js/tests"` applies to every normal Bun invocation without removing any maintained test or changing deadlines. Fifteen focused Bun contracts pass; Node passes fourteen shared contracts and explicitly skips the Bun-only discovery probe. Full matrices remain in GitHub CI.

The current JavaScript template has the same empty configuration and unrestricted workflow command, verified via authenticated contents API. [Upstream issue 269](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/269) includes pinned sources, a dependency-free reproduction, workaround and suggested configuration/regression changes. `research/bun-discovery-sources.json` records primary documentation; the reference tree/hashes remain unchanged.

The same source's Links job initially received Google HTTP 429 redirects to its rate-limit page (log lines 405/426), while the exact official Contacts article remained live. A single hosted retry passed with no source change, ignore addition or status waiver. Both attempts remain preserved under `artifacts/final-verification`; this is external throttling evidence, not a repaired product URL.

## F22: CodeQL release-script defects, distinct from scan-upload success

On final source `beb9a57`, all four workflows completed successfully, but commit-wide check enumeration found separate CodeQL service check `122979195002` failed with two high-severity annotations. The exact check output and annotations are preserved under `github/`; this is a real failed required context, not a passing run. `research/codeql-javascript-2047218465.sarif` retains the complete result report and `codeql-findings-inventory.json` maps every result to its GitHub alert. It contains 52 results: these two release-script annotations and 50 existing product/test baseline alerts. Baseline alerts are retained, not dismissed, declared repaired, or confused with emitted workflow warnings. This CI repair does not claim a zero-alert whole-product security audit.

The formatter's `body.includes('img.shields.io')` wrongly treats prose and arbitrary hosts as an idempotence marker. `hasNpmVersionBadge` instead requires the complete badge generated for the requested package/version. Regression cases cover prose, hostname suffix/path/userinfo tricks, other packages and old versions. The version writer pre-escapes quotes before passing the message into an already escaping command-stream tag, changing literal data. `commitReleaseVersion` interpolates the original message once. A real temporary Git repository verifies a normal version and a message containing quotes, backslashes, command substitutions and backticks without executing their contents. Both tests fail before the corrections; 13 relevant Node tests pass after. The fixture owns its LF policy and signing configuration.

The pinned JavaScript template already contains the structured formatter repair; upstream issue 208 is closed. The current template also uses argv-based commit invocation. Their source and issue history are preserved; no duplicate upstream issue or security-alert dismissal is created. Primary query/library documentation and reuse decisions are recorded in `research/release-security-sources.json`.

## F23: collect standalone checks and their annotations

The workflow collector originally enumerated only Actions jobs, so successful scan-upload jobs concealed the separate failed CodeQL service context from its evidence index. Final PR-wide review caught it before readiness. The collector now enumerates every selected commit's check runs (`filter=all`, all pages), legacy statuses and every check's nonempty annotations, including standalone services while a workflow is pending. It refreshes those annotations and prints non-passing contexts explicitly. The offline, finite Python regression demonstrates missing standalone evidence before and complete two-page annotations after; it makes no network calls. Workflow success alone is never the final PR verification criterion.
