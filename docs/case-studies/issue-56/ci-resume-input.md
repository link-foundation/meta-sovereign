# Unresolved hosted résumé input validation

Exact published `cac7f7d3` Checks run `43591479049`, created 2026-11-14 at
11:44:49 UTC, fails macOS WebKit shard 4 job `132437782294`. Complete job-log
lines 1000–1001 report `page.waitForFunction: Timeout 30000ms exceeded` at
`e2e-job-resumes.mjs:24`; line 1173 names `job-resumes`. Unlike the earlier
[immediate rendered-state assertion](ci-resume-render.md), this run exhausts
the existing wait. The previous wait-only change did not establish the cause.
The browser artifact has no screenshot of the failed résumé fixture.

An unchanged isolated Linux WebKit probe receives trusted focus, beforeinput and
input events, retains `invalid/hash` and disables Search. This passing probe
does not reproduce or explain the macOS failure. The complete hosted workflow,
job and pipeline logs are preserved in the
[daily-wait evidence bundle](application-limit-wait.md).

The résumé scenario now checks that the native control actually contains the
invalid hash before waiting for rendered validation. Opt-in fixture tracing
records at most 32 focus/input events, native-versus-rendered value agreement,
the two button states and document readiness/visibility. It records no entered
text, résumé hash, keyboard key or URL. The existing browser CI lane enables
this targeted tracing; ordinary runs leave it off. A failure always reports a
small state snapshot, and the fixture now honors the existing CI artifact
directory for failure screenshots. Production UI behavior and every scenario,
engine and deadline remain unchanged.

Six focused Node checks pass, including the trace's privacy/event bound and
the existing browser registration contracts. The newly built SPA's six résumé
scenarios pass on WebKit with zero provider clicks, no page errors and all
fixtures closed. The smaller standalone probe also retains an actual native
screenshot. Scoped lint, formatting, secret checks and the unchanged duplication
gate are recorded with the source snapshots in
`data/ci-resume-input.tar.gz` and its SHA-256 manifest. An initial compatibility
run used the checked-in bundle; the separate fresh-build run supplies final
production-source evidence.

The original macOS input/render timing remains unproven. This is a diagnostic
unit, not a claim that a provider bug or the original timeout is fixed. Monitor
every exact-head hosted check and use its bounded trace if the failure recurs.
All 81 original unchecked inventory rows remain required; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
