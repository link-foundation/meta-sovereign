# Nested greeting controls in CI

Checks/release [42745344946](https://github.com/link-foundation/meta-sovereign/actions/runs/42745344946)
was created at 02:49:18 UTC on 2026-11-10 for
`f509126099eeff0ae00873162a69255b99eecf6d`. Every runtime job passed, as did
the four auxiliary workflows. Both browser jobs failed in two existing scenarios.

The complete downloaded log has 96,962 lines. WebKit lines 16473–16492 and
Chromium lines 18873–18892 show the same strict-mode error:
`[data-catalog-panel] summary` matches the outer catalog heading and the new
nested group-greeting heading. The affected scenarios stop before exercising
catalog refresh or reviewed sends. Lines 96944–96946 show the aggregate correctly
rejecting the browser failures. There is no timeout or provider failure here.

Both scenarios now select `[data-catalog-panel] > summary`, the catalog's own
disclosure control. This preserves their full workflow assertions and allows
the independently tested nested group workflow to remain available.

The catalog scenario reproduces the exact two-element failure locally before
the selector correction. Afterward, the complete catalog and reviewed-send
scenarios pass sequentially in production Chromium. Changed-test strict lint
and formatting pass. Only these two affected browser scenarios ran locally;
both engines and the full matrix remain required in current-head CI.

The complete workflow log, exact job status, failing-before log and passing
focused checks are preserved in `data/ci-greeting-panel-selectors.tar.gz` with
a verified SHA-256 manifest. The two changes are test selectors; product UI
behavior is unchanged. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
remains draft while the other issue-wide requirements are implemented.
