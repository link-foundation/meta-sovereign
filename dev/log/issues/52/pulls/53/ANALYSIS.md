# Analysis and sequence of events

## Scope and source confidence

The complete issue body and all issue/PR conversation, inline and review endpoints
were collected. At the initial audit these were empty; no required sub-issue was
linked. The later CodeQL bot review of the deliberate timeout fixture was read
and answered; its reviewed exception and passing rerun are archived. This is a maintenance audit of all existing publication and validation
paths, rather than a request to replace the application with template demos.
The original main commit is `dc30f00aefb2c1a89c64bf7e7fa78ef80a860fe7`, merging PR 51.
Earlier PR 44 already implemented most CI safeguards; this PR preserves them.

The original run metadata, jobs, annotations and logs are in the archive's
`metadata/` and `ci-logs/`. Line references below use those original raw logs.
`research/raw-diagnostics.txt` and `research/diagnostics.json` are search indexes,
not independent failures: echoed shell source can contain words such as `error`.
An actual executed diagnostic, failed step, assertion or SARIF result is required
before classifying a problem.

## Timeline (UTC, October 28–29, 2026)

| Time | Event and evidence |
| --- | --- |
| Oct 28 23:55:26 | Main starts Checks/release 40790628774, Pages 40790628783 and Links 40790628767 at the same SHA. |
| 23:55:31 | Managed Dependabot Docker update run 40790638881 starts. |
| 23:55:33 | Scheduled audit 40790641642 starts on that SHA. |
| 23:55:42 | Links completes successfully. |
| 23:56:06 | Dependabot completes successfully. Its certificate-bundle warning belongs to the managed runner setup. |
| 23:58:32 | JavaScript CodeQL analysis updates 50 open alerts while the analyze/upload step remains successful. Other language result sets are empty. |
| Oct 29 00:00:11 | Scheduled security workflow reports success despite those findings. |
| 00:00:27 | Pages completes successfully, with a DEP0040 action-bundle deprecation warning. |
| 00:09:32 | Checks/release fails during version/commit. All prerequisite validation passed; a generated 1.0.0 commit exists only on its runner. The lockfile guard prevents push/publication. |
| 00:09:34–00:10:14 | Desktop fallback 40792195318 runs. It correctly blocks after upstream versioning failed, but finishes green without a visible skip annotation. No installers were built. |
| 04:07:16 | Issue 52 created with those six runs. |
| During PR 53 | Minimal reproductions establish peer pruning, missing-job acceptance, storage getter evaluation, unsafe parser/prototype paths, and writer-policy gaps. Atomic fixes and upstream reports follow. |
| 04:52:54 | Head 01ac7d3 starts CI. The new SARIF gate rejects a remaining intentional adversarial test; runtime/browser checks expose two implementation mistakes. Both are reproduced/corrected before the next push. See VALIDATION.md. |
| 05:07:24 | All four automatic workflows at cdd2c7d8 eventually pass, but the separate aggregate CodeQL check remains neutral: four scheduled-workflow configurations are missing from PR coverage. Workflow success alone is insufficient evidence. |
| 05:24:58 | All four automatic workflows at 9f0749d4 eventually pass, including the safe SVG compatibility repair and archive verification. |
| 05:27:43 | Manually dispatch the scheduled audit on 9f0749d4. Uploading its missing categories clears the aggregate check, but the strict local SARIF verdict correctly rejects a remaining thrown-string stack path. |
| 05:39:42 | Push 1868964c with reproducing regressions, safe first-line error summaries and automatic PR coverage for both CodeQL configuration families. Five workflows now run automatically. |
| After 05:39:42 | All five workflows at 1868964c complete successfully, along with the aggregate CodeQL check covering all eight baseline configurations. Diff review also finds/restores wave-plus-addressee compatibility before the final evidence push. |

The release failure follows dependency updates in PR 51, but npm's re-resolution
operation is the root cause. Relaxing the strict tree guard would publish a
dependency tree that did not pass CI and is therefore an incorrect fix.

## Root causes, alternatives and chosen repairs

### Versioning changes dependencies after validation

`ci-logs/40790628774-attempt1.log:76652` reports
`Package configuration changed after validation: package-lock.json`; line 76653
is the nonzero exit. The focused release log records the same at lines 471–472.
Both Changesets and instant-version scripts ran
`npm install --package-lock-only --legacy-peer-deps`. With npm 12.2.1 this removes
`electron-builder-squirrel-windows@27.0.0-alpha.13`, a peer entry, while bumping
0.55.0 to 1.0.0. `research/lockfile-structural-diff.json` and
`validation/lockfile-probe.log` preserve the structural reproduction.

Possible fixes: change the peer resolution flags; weaken the guard; or stop
resolving dependencies during versioning. Only the last preserves the exact
validated graph independently of registry state. `sync-lockfile-version.mjs`
validates v2/v3 lock roots and names, then changes only the two root version
fields. Both release modes share it and use installed Changesets offline.
An isolated root/nested × changeset/instant rehearsal compares the complete graph.
No dependency guard is weakened; pending changesets still determine the bump.

### Green code scanning with unresolved findings

CodeQL's analyze action uploads results; a successful upload does not mean zero
findings. Both scheduled and release workflows lacked a SARIF verdict. The exact
main JavaScript SARIF contains 50 findings (the per-alert inventory is linked
separately), while workflow status is success. This is a pipeline false negative.
Some findings are real parsing/prototype/diagnostic problems, others are weaker
URL assertions in tests, and two are intentional regex behavior.

A severity threshold or disabled queries would hide results. The chosen gate
requires valid SARIF 2.1.0 with CodeQL runs/results, rejects failed invocations,
missing reports and every unresolved result regardless of severity, and archives
the reports even on failure. Audited exceptions match rule, path, exact source
line and the SHA256 of the entire file, with reasons and a named regression.
The regex API intentionally accepts expressions; its input caps and existing
server VM budget remain intact. The adversarial timeout test deliberately invokes
that budget. Neither exception is a claim that all JavaScript regular expressions
are linear-time in every browser. GitHub alert reviews for #2 and #35 are archived.

Production repairs replace overlapping regex/HTML stripping with streaming
parsing or direct delimiter scans, whitelist canonical CV fields before writes,
use safe message extraction rather than arbitrary error object stringification,
and validate CRM formatter names as own properties before invocation. URL tests
now compare parsed origins/hosts or exact array/text tokens. The experiment CLI
uses argument arrays instead of shell interpolation. Existing importer, MIME,
CV, greeting, wallpaper and client tests remain required. Self-review added a compatibility
regression for safe SVG text/filter/inline drawing styles: canonical presentation
attributes preserve them while escaped/external resource CSS stays rejected. See CODEQL-FINDINGS.md.

Complete diff review also found that the first linear greeting scanner skipped
wave emoji as punctuation, losing the existing wave-plus-addressee behavior.
A failing `👋 there!` regression establishes the compatibility problem. Counting
recognized wave gestures as greeting tokens restores all five direct pattern
contracts and English/Russian addressees while retaining one-pass consumption.
The existing greeting consumers and bounded rejection probe pass together:
`validation/greeting-emoji-after.log` records 38 passing tests. Non-greeting
emoji plus an addressee remains rejected.

### Missing PR configurations and a remaining stack-string path

The separate aggregate CodeQL check is not a workflow job. At cdd2c7d8 it reports
four missing `security.yml` language categories; a snapshot during the manual
9f0749d4 audit still reports one. Main has both release and scheduled categories,
but the scheduled workflow had no PR trigger. All three template security
workflows already include that trigger. Adopt their coverage here and explicitly
allow documentation-only PRs through the release CodeQL condition, retaining
prerequisite failure/cancellation guards and all four languages in each family.
Renaming categories or deleting baseline analyses would discard useful evidence.

The manual scheduled JavaScript scan has a different extraction context from
the dependency-installed release scan. Its unabridged SARIF shows a surviving
flow from `routes-backup.js:87` through `safeMessage`'s string branch to
`util.js:57`. `ci-logs/40823528729-attempt1.log:11502–11504` records the strict
gate's rejection. This establishes the path; the different extraction context
explains why running only one configuration was insufficient, without claiming
that CodeQL guarantees identical result sets for both environments.

The first repair rejected arbitrary objects but retained string-thrown stacks.
Separately, JSON error normalization still invoked arbitrary `toString` methods.
The new minimal tests fail on an ordinary two-line stack string and an object
whose `toString` throws. The shared summary now extracts only the first message
line and redacts credentials; JSON errors use that same boundary. Actual
`Error.message`, string errors, CRLF stacks and existing status/code behavior are
covered. Private structured logs can retain redacted diagnostic fields. No rule
or new finding is exempted. See `validation/codeql-follow-up-before.log` and
`validation/codeql-follow-up-after.log` for the failing/passing runs.

The aggregate becoming successful after an upload did not override the failed
SARIF verdict. Both complete configuration coverage and the strict verdict are
necessary. Final verification checks all five workflows and the aggregate result
at the same head SHA.

### Storage warnings and the fallback correction

The main runtime logs contain 42 Node warnings (14 per OS) for initializing the
lazy `localStorage` getter without a storage file. Catching a later exception or
using `typeof globalThis.localStorage` still evaluates that getter. The shared
`getLocalStorage` inspects the descriptor before access outside a browser and
handles denied origins. All maintained direct preference reads/writes use it;
plain injected storage and actual browser storage remain supported.

CI on 01ac7d3 found that two driver selectors still compared the helper result
to `undefined`, so `null` selected an unusable driver. The minimal new selector
round-trip test fails first; both selectors now capture storage once and choose
the in-memory driver when it is absent. Existing offline CV/serverFetch tests
also pass after the fix. Browser-only persistence behavior remains covered in CI.

### Desktop evidence and observable skips

The original fallback was correctly blocked by the failed version commit
(`ci-logs/40792195318-attempt1.log:338`). The job-feed parser additionally accepted
an empty list by vacuous truth and did not verify complete pagination. It now
requires nonempty, completed, internally consistent job evidence with a positive
integer total. Tests reject empty/truncated/malformed evidence. The narrow existing
exception for the `Publish to npm` step remains, preserving desktop recovery.
Blocked, superseded and already-present assets receive explicit `::notice::`
annotations. Hive principle 17 calls for an honest green downstream skip, so an
upstream failure is not duplicated as another unrelated red workflow.

### Writer concurrency and lost races

Five writers (normal/instant release, changeset PR, Pages deploy, desktop publish)
previously did not share a queue across workflows; desktop had cancellable
workflow scope. All five now use the same repository/main writer group with
cancellation disabled; all 29 other jobs use distinct cancellable groups including
matrix identity. Source checks, merge simulation and publication prerequisites
remain required.

Serialization alone cannot refresh a queued checkout. The release push retries
only a confirmed non-fast-forward/fetch-first or Git's exact main-ref compare-and-
swap race, at most three attempts. Ruleset, permission, authentication and other
transport failures retain their real failure immediately. Every retry fetches,
checks source identity, and recomputes version/changelog metadata on top of the
remote metadata tree. New source supersedes the run; it is never silently released.
This preserves remote history without any force push. Success output is emitted
only after a confirmed push. A real local bare-remote rehearsal verifies metadata
recomputation, source supersession and policy refusal, rather than only mocking Git.

## Remaining diagnostics: ownership and disposition

| Original diagnostic | Cause and action |
| --- | --- |
| Pages DEP0040, `ci-logs/40790628783-attempt1.log:1127` | One warning from `actions/deploy-pages@v5.0.1` bundled punycode dependency. Latest upstream release still contains it. Existing upstream reports #413/#434 are linked in UPSTREAM.md with reproduction and rebuild suggestion. Match the JS/Rust template workaround: suppress only `DEP0040` on this single deployment step using Node's code-specific flag. A regression proves unrelated warnings/deprecations remain visible. Remove the flag after the action bundle is repaired. |
| Managed Dependabot OpenSSL rehash warning, `ci-logs/40790638881-attempt1.log:65` | `ca-certificates.crt` is an aggregate trust bundle; OpenSSL rehash expects one certificate/CRL per file and skips that bundle while processing individual certs. The update succeeds. This is managed infrastructure outside repository workflow code, not a package/update failure; do not split/delete the trust bundle or suppress runner logs. |
| GitHub runner capacity/migration notices | Original release annotations contain three macOS ARM capacity notices; the managed Dependabot run announces the `ubuntu-latest` migration. These are platform scheduling/image notices, not failed tests. Maintained jobs use explicit supported runner labels; macOS native jobs and all desktop targets pass in follow-up CI. Keep native coverage and preserve the notices rather than treating them as application warnings to suppress. Full annotation JSON is archived for each run. |
| esbuild `4.2mb` size marker | Informational size output. Bundle build and package/browser checks are still required; no false build failure inferred from the glyph. |
| Skipped release/publish jobs on a PR | Expected event guards: PRs build/check without external publishing credentials. Main preflight remains strict and actionable. |
| Older branch run cancellation | Expected cancellation of superseded read-only checks; compare timestamp and head SHA before treating it as a regression. Active writers retain cancellation protection. |

These classifications are based on original executed output, not absence of a red
badge. The action deprecation uses a documented temporary workaround; this PR does
not claim to have fixed upstream's bundled dependency or GitHub runner internals.

## Primary research and existing components

- [npm legacy-peer-deps](https://docs.npmjs.com/cli/using-npm/config/#legacy-peer-deps) documents ignored peer constraints when constructing a tree, consistent with the reproduced pruning. Existing Changesets stays responsible for versions/changelogs; the new helper only synchronizes existing metadata.
- [CodeQL analyze inputs](https://github.com/github/codeql-action/blob/main/analyze/action.yml) expose SARIF output; local parsing adds the missing verdict. The existing gate in konard/konard.github.io PR 32 was studied; its source snapshot is archived as `research/reference-codeql-gate.mjs`.
- [GitHub workflow configuration](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options) explains PR scanning and categories derived from workflow/action/matrix identity. The [CodeQL stack-exposure query](https://github.com/github/codeql/blob/main/javascript/ql/lib/semmle/javascript/security/dataflow/StackTraceExposureQuery.qll) distinguishes message-property reads from stack propagation. The real thrown-string reproduction supports the first-line repair independently of the analyzer.
- [htmlparser2](https://github.com/fb55/htmlparser2) exposes streaming token callbacks and XML mode. Exact-pinned 12.0.0 is reused for import, CV and restricted SVG paths, with the existing browser bundle rebuilt. This avoids inventing another HTML tokenizer. Its documentation recommends parse5 for strict HTML5 compliance; the import paths need event parsing rather than full browser DOM layout. Cheerio's DOM/query layer is unnecessary for the streaming cases.
- [RE2](https://github.com/google/re2/blob/main/README.md) guarantees bounded matching complexity but excludes lookarounds/backreferences. It is not a compatible replacement for the existing general regex API; replacing that API would be a separate feature decision, not silently escaping user expressions.
- [Node CLI warning controls](https://nodejs.org/api/cli.html#--disable-warningcode-or-type) support the single-code deployment workaround. A broad `NODE_NO_WARNINGS` or shared process flag would conceal unrelated failures and is not used.
- [OpenSSL rehash](https://docs.openssl.org/master/man1/openssl-rehash/) explains the one-certificate-per-file requirement behind the managed certificate-bundle warning.

Plans were executed in dependency order: preserve original evidence; add failing
regressions; repair versioning/observability; enforce SARIF and resolve findings;
apply template writer policy and retry semantics; rerun focused checks and broad
CI; archive refreshed evidence and finalize the unmerged PR. Exact validation
results and any unresolved acceptance criteria belong in VALIDATION.md.
