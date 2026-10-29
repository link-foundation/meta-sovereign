# Reproduction and validation evidence

## Focused local checks

All paths in this section are relative to the archive's `validation/` directory.
Tests ran against isolated fixtures, with `--test-concurrency=1`. No full runtime,
browser, desktop or stress matrix ran on the user's machine. Counts describe
individual runs and overlap; they must not be added as unique test totals.

| Regression / consumers | Before the repair | After the repair |
| --- | --- | --- |
| Version metadata and dependency guard | `version-lock-before.log`: four failures; `lockfile-probe.log`: actual npm 12.2.1 peer pruning | `version-lock-after.log`: 5 pass; `rehearsal.log`: both actual version CLIs in root/nested layouts preserve the complete graph |
| Desktop upstream evidence | `desktop-gate-before.log`: 2 failures accepting empty/truncated feeds | `focused-release-after.log`: all 11 version/desktop tests pass, including narrow npm-publish recovery |
| Server storage access | `ssr-before.log`: actual appearance preference evaluates the native getter | `storage-after.log`: 43 pass; descriptor, denied-origin, injected storage and consuming preferences covered without warnings |
| Storage driver selection | `storage-selector-before.log`: null storage selects a broken driver | `ci-regressions-after.log`: 24 pass, including selector round trips and CV/serverFetch consumers |
| Unsafe parsing, CV writes and diagnostic disclosure | `security-findings-before.log`: 4 failures; Russian greeting child times out at 2 s on a finite 32-q-plus-x input | `security-final.log`: 7 pass including SARIF contracts; the same bounded child completes in about 77 ms |
| Parser compatibility | Original importer/CV/mail/greeting/wallpaper tests retained | `security-parsers-after-2.log`: 78 pass; `security-consumers.log`: 152 pass |
| Safe SVG drawing compatibility | `svg-compatibility-before.log`: safe text/filter/inline-style assertion fails before compatibility repair | `svg-compatibility-after.log`: 21 security/wallpaper tests pass; external/escaped CSS remains rejected |
| Writer serialization | `writer-policy-before.log`: 2 failures | `writer-policy-after.log`: 2 pass, covering all jobs and all five writers |
| Action warning isolation | `action-warning-before.log`: 2 failures | `action-warning-after.log`: 4 writer/warning tests pass; DEP0190 and unrelated warnings remain visible |
| Push classification and metadata retry | `push-retry-before.log`: missing helper; `push-race-ref-before.log`: real Git compare-and-swap variant fails classifier | `push-and-gate-after.log`: 8 pass; `push-rehearsal.log`: actual CLI against a bare remote preserves concurrent metadata, supersedes new source, and rejects GH013 without retry |
| Deliberate catastrophic-regex fixture | Existing fixed 5001-character input retained through the VM-limited matcher | `regex-budget-final.log`: the named timeout regression passes in about 110 ms; no uncontrolled direct match |

The adversarial greeting child uses finite input, a 96 MiB V8 heap, a 512 KiB
stack and a two-second child deadline. Broad backup-memory regression remains CI
only. The release rehearsals use installed tooling without registry resolution;
the push rehearsal publishes only to temporary local Git repositories.

Changed-file ESLint (explicit `js/eslint.config.js`), Prettier, Python compilation,
workflow policy checks, generated web bundle rebuild and `git diff --check` pass.
`workflow-final.log` verifies all 19 required pipeline prerequisites. The original
`docs-final.log` records an investigation command mistake (a nonexistent helper),
not a product failure; `docs-final-corrected.log` verifies the actual required
files, four-language requirement IDs and documentation constraints. The real
documentation job runs again in final-head CI.

## CI failures investigated during development

Full run logs and job/annotation metadata are archived, including superseded
runs. These failures were diagnosed from executed output, not stale badges:

| Run / head | Specific evidence and resolution |
| --- | --- |
| Original main 40790628774 / dc30f00 | `ci-logs/40790628774-attempt1.log:76652`: lockfile changed after validation. Version-only synchronization fixes the cause and retains the guard. |
| 40817622675 / 7d4c6c82 | `ci-logs/40817622675-attempt1.log:35148`: Node's storage driver calls `getItem` on null; other runtime logs expose the same selector bug. Fixed in both selectors. |
| 40819255960 / 5a7ad1c0 | `ci-logs/40819255960-attempt1.log:2883`: two changesets violate one-fragment-per-PR policy. Consolidated into one R-Z34 patch fragment. |
| 40820084958 / 1a0274ef | `ci-logs/40820084958-attempt1.log:2434`: three fragments before the consolidation commit; same policy, now repaired. |
| 40820204785 / 01ac7d3 | `ci-logs/01ac7d3-deno.log:5919`: null storage; `01ac7d3-chromium.log:1162`: incorrect `asked.split` assertion on an array; `01ac7d3-codeql.log:1898–1899`: the strict new gate rejects one deliberate adversarial test. Fixed selector/assertion; restored the original timeout fixture and audited its exact source hash. |

The CodeQL bot inline review was read and answered at
[discussion_r4408929705](https://github.com/link-foundation/meta-sovereign/pull/53#discussion_r4408929705).
All original 50 results have individual dispositions in CODEQL-FINDINGS.md.
The two intentional expressions retain queries, bounded regressions and narrow
whole-file-hash exceptions; they are not blanket regex suppressions.

## Completed broad CI at the archive cutoff

All four workflows completed successfully at the same exact pushed commit,
`cdd2c7d87f41b5ddac4161d84d96148e366176de`, created 2026-10-29 05:07:24 UTC:

- [Checks and release 40821555769](https://github.com/link-foundation/meta-sovereign/actions/runs/40821555769): nine runtime/OS combinations, Chromium, native WebKit, all four CodeQL languages, dependency audits, Rust/native/container/package checks, bounded backup regression, workflow contracts and both offline release rehearsals.
- [Desktop 40821555630](https://github.com/link-foundation/meta-sovereign/actions/runs/40821555630): all six OS/architecture packages build successfully.
- [Pages 40821555633](https://github.com/link-foundation/meta-sovereign/actions/runs/40821555633): build and PR bundle browser verification pass.
- [Links 40821555696](https://github.com/link-foundation/meta-sovereign/actions/runs/40821555696): pass.

The safe-SVG compatibility adjustment at `ebb1425b` has the additional failing/
passing local evidence above. The final evidence/documentation commit includes
an automatic streaming verification of every archive member in workflow CI.
It requires another exact-head CI pass before PR 53 is marked ready. Final run
URLs and the validated SHA are recorded on the live PR, avoiding an endless
cycle in which archiving a run creates another commit needing its own run.
The archive is a dated collection, not a claim about future workflow status.

## Completion boundaries

The original main commit remains incorporated; no force push or merge is used.
All issue comments, PR conversation comments, inline comments and reviews were
read through their separate paginated endpoints. No required sub-issue exists.
PR readiness, clean working tree and final exact-SHA checks are verified live
after pushing the archive. No issue requirement is knowingly deferred.

PR event guards intentionally prevent real npm publication and Pages/desktop
release writes. Actual versioning and lost-push recovery are exercised offline;
this work does not claim to have published a release. The deploy-pages action
bundle remains an upstream defect with a narrowly scoped documented workaround.
Managed Dependabot certificate-bundle output is explained from OpenSSL behavior;
repository code does not alter GitHub's runner trust store.
