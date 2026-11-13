# Wait for rendered résumé validation in WebKit

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Exact commit `80e93aa5e5bcd73b6e50ad244f92550c1eb5835d` runs in
[Checks 43507470753](https://github.com/link-foundation/meta-sovereign/actions/runs/43507470753),
created 2026-11-13 at 21:05:12 UTC. WebKit shard four fails at job-log
lines 968–985: the résumé scenario samples `isDisabled()` immediately after
filling an invalid hash and sees `false`. The assertion is at helper line 22.
This is an observed rendered-state assertion failure; the available trace
does not establish a provider failure or a particular React scheduling cause.

The fixture now waits for the same disabled predicate before asserting it.
Its original scenario deadline, invalid hash, inventory privacy checks,
keyboard selection and native pagination assertions remain in place. No
production behavior or timeout changes. A focused production-app WebKit run
passes all six résumé scenarios, including Stop drainage, failed-refresh
retention, empty/loading distinctions and phone reload. Run it with
`RUN_BROWSER_E2E=1 E2E_BROWSER=webkit node js/tests/e2e-job-resumes-browser.mjs`.
Scoped lint and formatting pass.

The [archive](data/ci-resume-render.tar.gz) and
[manifest](data/ci-resume-render.tar.sha256.json) preserve the full 1,196-line
failed job log, exact run metadata, unchanged parent helper and local result.
The same head also exposes Windows Node IndexedDB-shim transaction timing
and Windows Deno initial CLI readiness failures. Those are separate,
unfinished investigations. This focused correction does not establish a
passing hosted matrix or complete any unchecked issue-wide requirement.
