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
| Complete CodeQL coverage and safe error summaries | `codeql-follow-up-before.log`: 3 failures for missing documentation-only PR coverage, stack-string disclosure and arbitrary JSON error stringification; API snapshots separately establish the absent scheduled PR trigger | `codeql-follow-up-after.log`: 12 workflow/security/redaction tests plus the existing JSON error-contract test pass; corrected changed-file lint passes in `codeql-follow-up-lint.log` |
| Greeting emoji compatibility | `greeting-emoji-before.log`: wave-plus-addressee regression fails against the first linear scanner | `greeting-emoji-after.log`: all 38 greeting/security tests pass, including direct pattern tests, English/Russian addressees and the bounded rejection probe; lint and rebuilt bundle pass |
| Transitive Telegram storage initialization | `telegram-warning-trace.log`: actual store2 getter stack; `telegram-storage-before.log`: two failures (getter read and native warning) | `telegram-storage-consumers.log`: 104 relevant tests pass without warnings; `telegram-storage-disk-roundtrip.log`: both regressions pass with original disk constructor identity and actual write/reopen; changed-file lint passes |

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
| 40823528729 / 9f0749d4 | `ci-logs/40823528729-attempt1.log:11502–11504`: scheduled JavaScript SARIF rejects a surviving stack-trace flow through safeMessage's string branch. Full SARIF artifact 12875292804 and compact analysis retained. Minimal stack-string/JSON-error regressions fail first, then pass with the shared summary boundary. |
| 40827010880 / 6576ca4b | `ci-logs/40827010880-attempt1.log:405–408`: the RFC Editor's canonical info URL repeatedly redirects to itself, then returns 502/timeouts. Strict gate correctly fails. Full link artifact, HTTP probes and immutable upstream worker source retained. All four email translations use the verified 200 direct HTML URL; `rfc8621-docs-format.log` passes. Upstream #577 distinguishes observed CI reproduction from later local success. |

The CodeQL bot inline review was read and answered at
[discussion_r4408929705](https://github.com/link-foundation/meta-sovereign/pull/53#discussion_r4408929705).
All original 50 results have individual dispositions in CODEQL-FINDINGS.md.
The two intentional expressions retain queries, bounded regressions and narrow
whole-file-hash exceptions; they are not blanket regex suppressions.

## Broad CI and the archive cutoff

All five workflows completed successfully at the same exact pushed commit,
`1868964c909fe43fb812fea297c299c9042abfb7`, created 2026-10-29 05:39:42 UTC:

- [Checks and release 40824679380](https://github.com/link-foundation/meta-sovereign/actions/runs/40824679380): nine runtime/OS combinations, Chromium, native WebKit, all four CodeQL languages, dependency audits, Rust/native/container/package checks, bounded backup regression, workflow contracts and both offline release rehearsals.
- [Scheduled security audit 40824679372](https://github.com/link-foundation/meta-sovereign/actions/runs/40824679372): all four CodeQL languages, strict SARIF verdicts, dependency audit and terminal gate pass.
- [Desktop 40824679560](https://github.com/link-foundation/meta-sovereign/actions/runs/40824679560): all six OS/architecture packages build successfully.
- [Pages 40824679366](https://github.com/link-foundation/meta-sovereign/actions/runs/40824679366): build and PR bundle browser verification pass.
- [Links 40824679700](https://github.com/link-foundation/meta-sovereign/actions/runs/40824679700): pass.

Earlier four-workflow successes at cdd2c7d8 did **not** establish complete CodeQL
coverage: the separate aggregate check remained neutral with four missing
scheduled configurations (`metadata/previous-codeql-rollup.json`). At 9f0749d4 all four
automatic workflows also passed, but the manually dispatched scheduled audit
failed as recorded above. `metadata/final-codeql-check.json` preserves the
intermediate one-configuration-missing state. The final fix adds automatic PR
coverage for both families and requires the aggregate check to succeed alongside
all five workflow verdicts. See ANALYSIS.md for the sequence and root causes.

At `1868964c909fe43fb812fea297c299c9042abfb7`, both CodeQL families complete
successfully and the aggregate check succeeds with all eight configurations.
`metadata/1868964c-codeql-check.json` preserves the exact-head aggregate verdict.
The scheduled audit's strict JavaScript gate accepts the first-line error fix
without any new exception. Final collection also retains the failed manual run
and all available completed follow-up logs, rather than replacing failure evidence.

The safe-SVG compatibility adjustment at `ebb1425b` and greeting compatibility
adjustment at `cd388855` have additional failing/passing local evidence above.
The evidence/documentation commit includes automatic streaming verification of
every archive member in workflow CI. It requires another exact-head CI pass
before PR 53 is marked ready. Final run URLs and the validated SHA are recorded
on the live PR, avoiding an endless cycle in which archiving a run creates
another commit needing its own run. The archive is a dated collection, not a
claim about future workflow status.

The final collection extends through the available logs at `6576ca4b`, including
the intervening superseded runs, successful desktop/Pages/security jobs and the
failed RFC link run. Both CodeQL families and their aggregate succeed at that
head (`metadata/final-head-codeql-check.json`). The broad Checks and release run
40827010970 subsequently completes successfully, including WebKit, and its full
log is retained. That passing run still contains 21 transitive storage warnings;
the subsequent trace, reproducing regressions and lazy-session repair are also
archived. Links remains failed at that head; the RFC document fix and
refreshed evidence require all five workflows and the aggregate
CodeQL check to pass again at the final pushed SHA. Those final results belong
on the live PR, after the archive's cutoff.
The final Node logs are additionally inspected for remaining storage warnings;
workflow success alone did not close that requirement.

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
