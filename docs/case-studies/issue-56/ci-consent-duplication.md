# Consent fixture duplication

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The exact `fa1e21c775e8351af1c333b1ab16daaa904a4142` Checks run
44359416798 failed lint job 134997087157, started 2026-11-18T17:31:48Z and
completed 17:35:13Z. Full retained log lines 19981–19991 show 55,721 duplicated
lines among 856,624 scanned lines: **6.504720857692524%**. The displayed 6.50%
is rounded; the actual value exceeds the existing 6.5% limit. This failure
prevents the runtime matrix from starting. It is separate from the preceding
Windows/Deno rolling-worker import deadline failure, whose cause remains open.

Shared finite consent fixtures now own barrier creation, settled outcomes,
scoped acknowledged opt-outs and definite refusal assertions. The same 151
focused checks pass. Actual-parent browser-answer and plain-send runs still
produce 44 and 28 assertion failures, with ten and five independent controls
passing respectively. No scenario, assertion, deadline or gate is removed.
No production source changes in this correction.

Reproduce the static failure using the exact parent and `npm run check:duplication`.
The current static check passes at **6.4991595461549245%**, with 55,677 duplicated
lines among 856,680. The threshold remains 6.5%; the total contains all original
scanned directories. Source-bound [evidence](data/ci-consent-duplication.tar.gz)
and its [manifest](data/ci-consent-duplication.tar.sha256.json) include full hosted
logs, before/after JSON reports, exact parent/current fixture bytes and focused
verification. Initial local command-path/configuration mistakes are retained.

Full matrices remain hosted. All thirty unfinished original criteria remain
required; acceptance stays **88/118** and PR57 remains draft/unmerged.
