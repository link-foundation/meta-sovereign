# Issue 43: reliable CI and release gates

Issue: https://github.com/link-foundation/meta-sovereign/issues/43

Pull request: https://github.com/link-foundation/meta-sovereign/pull/44

The complete investigation, requirement matrix, timeline, pinned template trees, per-file comparisons, original and follow-up CI logs, API metadata and local reproductions are kept together in [dev/log/issues/43/pulls/44](../../../dev/log/issues/43/pulls/44/README.md).

The original failed package startup combined a cold installation and startup into one opaque deadline; the original macOS backup regression competed with the full unit suite; Linux WebKit errors were explicitly non-gating. Separate bounded probes, isolated stress validation, mandatory browser gates and durable artifacts make these failures visible. Where old logs cannot establish a deeper external/browser cause, the investigation records that limit and the opt-in diagnostics needed to distinguish it on a subsequent failure.

The comparison also found whole-range detection gaps, missing-report link false successes, release helper loading risks, registry/API error misclassification, source drift during publishing and absent workflow/security checks. These now have executable policy/regression coverage. Shared missing-report defects were reported to all three template repositories; the existing electron-builder dependency issue received an updated reproduction and migration evidence.

See [CI operations](../../CI-OPERATIONS.md) for local-check scope, artifact paths, verbose switches, trusted publishing setup and dependency review prerequisites. R-Z32 tracks the requirement in all four product documentation languages.
