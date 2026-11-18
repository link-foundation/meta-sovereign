# Shared application and Follow verification fixtures

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft. The issue inventory remains 86 verified and 32 unfinished; this correction accepts no additional criterion.

## Exact failure

All five workflows for `b02d90823ce6fb8e3309a8e622efa01d7cfeda0c` started on 2026-11-18 at 03:42:05 UTC. Desktop, Pages, Links and Security succeeded. [Checks run 44232242988](https://github.com/link-foundation/meta-sovereign/actions/runs/44232242988) failed before the main/browser test matrices could run.

The complete lint job is preserved as `ci-logs/hosted-b02d9082-134560181010.log`. Lines 19512–19517 report 54,617 duplicated lines out of 837,910 (6.52%) and exit 1. The existing threshold is 6.5%. The pipeline status failure follows this failed prerequisite. This is separate from the preceding fixed browser registration contract.

## Correction

The refusal tests now share owned fixture setup, explicit read/prefill/submit calls and the full uncertain-delivery assertion sequence. Both original named uncertain-send tests retain their independent warning/error inputs. Native warning and error checks share the final synchronous submit-boundary probe, including the warning snapshot assertion and the native-error explanation.

Four historical parent probes reuse the existing source context with explicit path sets. They retain their original parent commits, finite test commands and failure assertions; source restoration still runs in `finally`. Explicit missing paths continue to fail. The context supplies the same bounded Node heap to each probe.

The Follow CI entry and mobile diagnostic script share the production-route sequence, including failed verification, double-click admission, malformed receipt refusal, acknowledged import, unchanged source, temporary-client closure and settled phone layout. The diagnostic callback retains its extra layout observations and screenshot.

No assertion, scenario registration, CI deadline or duplication exclusion/threshold was removed. No production application behavior changes in this correction.

## Reproduction and verification

- The exact failed source can be checked with `npm run check:duplication`; its hosted failure is preserved above. The corrected check exits 0 with 54,456 duplicate lines out of 837,791 (6.50% rounded), passing the unchanged threshold.
- `node --test --test-concurrency=1 js/tests/job-application-holds.test.js js/tests/job-application-resume-visibility.test.js`: 17 passed, zero failures.
- The three focused historical parent probes still reproduce all six warning failures, five URL-filter failures plus its passing control, and the observation-history failures. Their production source bytes are restored before the current checks.
- Native warning main/popup checks: ten hidden/unrelated controls, four rendered variants, four synchronous refusals, retained owner values and zero submissions. Native hold check: six error kinds, retained deferral hold, one separately confirmed synthetic submission. Both return closed-browser receipts with no errors.
- The registered Follow browser entry passes in Chromium. All owned test processes finished. The main application server was not used.
- Scoped ESLint and Prettier pass. Python source parsing and `git diff --check` pass. Full platform/runtime/browser matrices remain hosted checks for the next exact source.

The adjacent source/log archive preserves the correction, original sources, complete failed logs and exact workflow metadata. Earlier feature evidence remains historical evidence for its original bytes; the current helper verification is recorded separately here.
