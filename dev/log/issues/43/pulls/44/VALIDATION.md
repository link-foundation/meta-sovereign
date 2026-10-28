# Validation and evidence limits

The latest implementation source is `65268154cac2817e09720bad18570a16ab7e12ab` (tutorial diagnostic preservation), following `2d42df908e5fe8f1cfa5db86ab33100ab9e833f2`, including the forward merge of `main` `fbf377b` (message-history single-write recovery, following release 0.54.1). The preceding implementation `c086c8f` has the complete fixture and warning fixes. Checks must match this source or a later evidence-only commit; older passing runs do not certify a newer product change.

## Focused local validation

Only relevant tests/checks were run locally with limited concurrency. No full local suite, stress case, browser/runtime matrix or Rust build was run. Test fixtures use temporary Git histories, fake registry/API responses and isolated data.

| Change / check | Evidence | Result |
| --- | --- | --- |
| Whole-change selection and reference exclusions | `local/detection-before.log`, detection fixtures and focused CI logs | Reproduced then fixed; five real-Git scenarios |
| Release/API/registry state and shell failures | `local/helpers-before.log`, `helpers-final.log`, `version-unknown-after.log` | Strict absence/unknown classification; 11 final helper/tree tests pass |
| Unknown Git state vs superseded source | `tree-unknown-before.log`, `tree-unknown-after.log`, `version-unknown-before.log`, `version-unknown-after.log` | Known source differences use exit 2; invalid history fails with exit 1; both desktop/versioning paths covered |
| Missing reports, archive states and browser/workflow gates | CI contracts and Wayback parser fixtures | Missing evidence and unknown API results fail; mandatory browser jobs feed the terminal gate |
| Builder schema/configuration and version provenance | `desktop-schema-before.log`, `desktop-schema-final.log`, provenance reproduction | Actual installed builder schema accepts final configuration and CLI reports exact 27.0.0-alpha.13 |
| Native FPM and maintained shell selection | `fpm-bundled-before.log`, `shell-evidence-before.log`, `fpm-bundled-after.log` | Reproduced then fixed; 24 desktop/contract tests pass |
| Workflow/security policy | `workflow-policy-final.log`, `zizmor-native-fpm.log` | 18 checks feed terminal gate; zero unsuppressed scanner findings |
| Deprecated/vulnerable dependencies | Recorded npm manifests/audits and lock regression | Root lock has no deprecated entries; audit has zero vulnerabilities; staged updater clean-install and actual cache probe also pass (see below) |
| Telegram client/CommonJS identity | Offline probe and focused Node/Deno Telegram logs | Maintained client and shared Api/BinaryReader registry verified without contacting Telegram |
| Sticker warnings | Focused SSR before/after logs | Static/video branch key warnings reproduced and eliminated; markup preserved |
| Windows command shims / DEP0190 | `command-process-deprecation-probe.log`, `command-process-{before,after,deno,contracts}.log` | Old raw-shell path reproduces DEP0190; replacement passes 31 focused Node tests, 3 Deno tests and 18 additional contracts; literal arguments and failure status preserved |
| Pre-commit archive scope | `archive-staged-checks.log`, `archive-integrity-after-hook.log`, `precommit-{before,after,deno}.log` | Real nested-task failure reproduced; rollback preserves all reference hashes; explicit root hook passes Node/Deno regression without dropping maintained-file checks; `archive-root-config-after.log` also records the actual complete staged-archive hook passing |
| Shared GitHub fixture shutdown | `fixture-close-{before,after,deno,debug,deno-debug}.log` | Incomplete-request shutdown fails before; passes after; 31 Node tests and 8 Deno suites/30 steps; debug output verified with default off |
| Complete owned network fixture shutdown | `all-fixture-shutdown-{before,after,deno}.log`, `all-fixture-mail-security.log`, `all-fixture-debug.log` | TCP and incomplete HTTP regressions fail before; 50 Node tests, 34 Deno tests / 50 steps and 20 Node mail-security cases pass; shared helper covers every owned HTTP/TCP/TLS fixture |
| Main message-history merge | `issue43-message-versions-merge-tests.log`, merge/build logs | Eight initial focused storage/API tests pass; latest recovery merge passes 19 message-version/store-append tests (`final-main-recovery-tests.log`); all upstream features retained; both browser manifests now contain 41 suites |
| Native macOS runner pool | `runner-pool-{contracts,policy,actionlint,format}.log`, capacity annotations | All nine runtime/OS combinations retained; native Intel Node/WebKit, ARM Bun/Deno/desktop; focused policy and lint pass |
| Rustdoc warnings / Windows Git line conversion | `rustdoc-warning-{before,after}.log`, `precommit-crlf-{before,after}.log`, `final-warning-deno.log` | Both reproduced before fixing; all three Rustdoc paths reject warnings; owned Git fixture has an explicit LF policy; focused Node/Deno and formatting pass |
| Tutorial failure diagnostics | `tutorial-diagnostics-{lint,contracts}.log`, `tutorial-phone-before.log`, `tutorial-phone-chromium.png` | CI missing-card failure preserved; focused Chromium phone flow passes through Playwright MCP; Linux WebKit stall is explicitly inconclusive; native CI pending |
| Formatting/lint | `lint-native-fpm.log`, `lint-version-unknown.log`, `format-experiments.log`, `lint-experiments.log` | Relevant maintained files pass |

Before logs intentionally retain nonzero failures, and failed experiment attempts are not erased. In particular, `local/validate-ci-docs.log` records an attempted nonexistent command; actual documentation validation lives inline in the workflow and is verified by the fresh CI documentation job, not by that failed command.

## Fresh CI

Pre-archive product verification run set, created at 16:16:41 UTC after `c086c8f` was pushed (completed; Checks fails only the WebKit tutorial assertion described below):

- [Checks and release 40724371995](https://github.com/link-foundation/meta-sovereign/actions/runs/40724371995)
- [Desktop release 40724371815](https://github.com/link-foundation/meta-sovereign/actions/runs/40724371815)
- [Pages 40724371795](https://github.com/link-foundation/meta-sovereign/actions/runs/40724371795)
- [Links 40724372043](https://github.com/link-foundation/meta-sovereign/actions/runs/40724372043)

Desktop, Pages and Links pass. The desktop log has no emitted dependency/DEP0190 warning; the only `::warning::` text is an unexecuted echoed branch command at line 314, while real updater-cache checks pass at **600, 1366, 2079, 3224 and 3827**. Windows Deno passes **3279 tests / 224 steps** in **3m16s**, including 8/14ms shutdown regressions and a **133ms** server-fetch case; its log has no Git conversion warning. Actual Rust documentation builds all three crates with warnings denied and no emitted warning. Chromium's saved summary contains all **41 suites, zero failures**. WebKit passes 40 suites but the tutorial suite reports one missing card on the phone viewport. Its original artifact lacks a screenshot and expected step; F19 documents the diagnostic fix without claiming an unproved product cause. Fresh run 40728542159 on `6526815` is pending review; the forward main recovery merge and archive commit receive complete current-source verification.

Preceding verification run set, created at 16:00:57–16:00:59 UTC after `cf236dc` was pushed:

- [Checks and release 40721747791](https://github.com/link-foundation/meta-sovereign/actions/runs/40721747791)
- [Desktop release 40721754929](https://github.com/link-foundation/meta-sovereign/actions/runs/40721754929)
- [Pages 40721748937](https://github.com/link-foundation/meta-sovereign/actions/runs/40721748937)
- [Links 40721748226](https://github.com/link-foundation/meta-sovereign/actions/runs/40721748226)

Checks on `cf236dc` fail because main advanced with message-history changes after the first jobs started: Bun/Deno macOS fresh-merge steps identify real conflicts. The forward merge above resolves these while retaining the new feature and adding its browser coverage. Node/macOS on the Intel pool passes 3418 tests; Windows Deno passes 3268 tests / 224 steps, removing the GitHub waits but exposing server-fetch teardown, now fixed across all fixtures. Desktop was superseded while its ARM macOS build was still queued; this incomplete run is not counted as passing.

Preceding F14 implementation run set, created at 15:39:34 UTC after `f91758c` was pushed:

- [Checks and release 40718185645](https://github.com/link-foundation/meta-sovereign/actions/runs/40718185645)
- [Desktop release 40718185722](https://github.com/link-foundation/meta-sovereign/actions/runs/40718185722)
- [Pages 40718185631](https://github.com/link-foundation/meta-sovereign/actions/runs/40718185631)
- [Links 40718185449](https://github.com/link-foundation/meta-sovereign/actions/runs/40718185449)

Desktop, Pages and Links pass on this source. The full native log `workflow-40718185722.log` has no emitted DEP0190/dependency warnings; the updater-cache checks pass at lines **600, 1389, 2456, 3068 and 3910**. Checks failed because Windows Deno reached its deadline after the two reproduced fixture teardown waits (F15), and Node/macOS plus WebKit never acquired a hosted ARM runner (F16). Their cancelled jobs are not counted as passing; the final source above fixes fixture ownership and moves the affected macOS checks to the supported native Intel pool. On preceding source `a8ea6a8`, all five native builds, both 40-suite browser engines and eight runtime targets pass; Node/macOS was still queued without a runner when the actual F14 hook fix was pushed. It subsequently ended without starting any steps: GitHub annotated “The job was not acquired by Runner of type hosted even after multiple attempts” and macOS arm64 capacity notices. The terminal gate correctly failed the incomplete matrix. This infrastructure failure is preserved, rather than relabeled as a pass or an application defect. Complete desktop log 40714282618 has no emitted DEP0190/dependency warnings, and actual updater-cache validation passes at lines **600, 1305, 1911, 2700 and 3802**. Windows Deno’s new helper tests pass at lines **2521–2523** of `deno-windows-40714282555.log`; line **5825** reports **3266 passed, 0 failed**. Metadata is collected by SHA/timestamp under `github/`; completed available logs/annotations are under `ci-logs/`. Unavailable workflow logs retain the API failure and fall back to individual completed-job logs.

Superseded runs are not application failures or passes. The first implementation run already passed package cold-install smoke, bounded backup stress, Rust, both 40-suite browser engines and native builder-26 packaging; later source changes require fresh results. Run 40704515855 correctly failed workflow security on the intermediate dynamic FPM environment-file write (lines 1012–1026); that setup is removed in the final implementation. Earlier merge conflicts were repaired through forward merges of the current default branch.

Diagnostic artifacts retained here are ZIP files verified against GitHub's recorded digests; `artifacts/SHA256SUMS` records the checksums. All available small diagnostic log/report artifacts are retained, including both browser engines, package diagnostics and link reports; original JavaScript/Rust API documentation is also saved. `diagnostic-inventory.json` records run/source and the expected/actual GitHub digests. ZIP CRC checks pass; the content report retains each exact historical browser summary, including the failed 41-suite WebKit tutorial result. Current-source runs must verify the complete 41-suite manifest with zero failures. Desktop installers are large release artifacts rather than investigation logs; their inventories, build logs, smoke checks and provenance are preserved without duplicating the binaries here.

## Updater deprecation resolved with a verified compatibility replacement

Published updater 6.8.11/6.8.12 and 7.0.0-alpha.12 still require deprecated `lodash.isequal`. Older native run 40701906023 records it for all five targets at lines **592, 889, 1269, 1619 and 1933**; the initial upstream report and failed candidates are retained rather than erased.

A scoped exact npm alias to `lodash.isequalwith@4.4.0` preserves the comparator's two-argument boolean contract. The metadata shows no npm deprecation. The finite isolated install experiment reports **zero deprecated entries and zero vulnerabilities**; actual staged install succeeds with no deprecation output. `validate-desktop-updater.mjs` verifies the installed updater cache after each target's real installation, without Electron, network, accounts or personal data. See `local/updater-alias-{probe,before}.log`, `updater-staged-after.log` and `updater-contracts-after.log` (40 focused tests pass). The compatibility override should be removed after an upstream fix is released.

Windows Deno's earlier abrupt AES-IGE exit is now reproduced as native construction terminating with 0xC0000005; the identical portable probe passes. The centralized application loader and reference comparison select the existing WASM backend specifically for Windows Deno. `local/telegram-runtime-before.log` and `telegram-runtime-after.log` preserve the selector regression (24 focused Telegram tests pass). `local/cifrante-guarded-linux-probe.log` verifies the maintained harness; Windows Deno verification now passes: `ci-logs/deno-windows-40710572359.log` lines **1742–1810** record both application/portable probes; lines **4215–4223** show the full-suite AES comparison succeeding; line **5821** reports **3263 passed (224 steps), 0 failed, 4 ignored**. The pre-existing ignores include the separately executed stress case; no crypto/runtime test is hidden. The raw native probe is retained as an explicit opt-in reproduction and [reported upstream](https://github.com/sanyok12345/cifrante/issues/1). Neither runtime nor crypto comparison is skipped.

## Historical and publication limits

Original logs cannot identify the exact external cause of the opaque package stall or old Linux WebKit rendering stall. Their proven deadline/aggregation/diagnostic defects are repaired; verbose modes default off, with artifacts for a recurrence. The PR selects native macOS WebKit and does not claim to repair Linux WebKit itself.

No production release is triggered from this PR. Permission/configuration and publication recovery tests use injected responses and real temporary Git trees. Main performs the actual OIDC exchange/dependency-capability check before expensive work and reports an explicit administrator action when required. Existing unsigned manifest/Windows signing behavior is preserved through builder v27; no signing guarantee is invented.

## Archive cutoff and final verification

This archive captures original failures and implementation iterations through the last product source above. The subsequent archive/collector-only commit is verified again by GitHub CI; its permanent run links and completion status are recorded in PR 44. It cannot include the logs of its own future run without creating another commit and another run. This is an explicit collection cutoff, not a substitution of stale product results or a claim that pending checks passed.
