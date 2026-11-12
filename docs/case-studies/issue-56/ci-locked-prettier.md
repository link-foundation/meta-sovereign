# Locked Hindi locale formatting

Exact commit `d76215a10034df559103f3d5e2604158eba174a1` starts Checks run
[43241143099](https://github.com/link-foundation/meta-sovereign/actions/runs/43241143099)
at 2026-11-12 14:49:07 UTC. Lint job 131261905765 fails at 14:51:17 UTC:
raw log lines 405–415 report ten `prettier/prettier` errors in
`js/src/web/locales/hi-vacancy.js`. Five other diagnostics are warnings.

The resumed workspace resolves Prettier 3.10.0 through its Deno-installed
dependency tree; `package-lock.json` and hosted `npm ci` use 3.9.10.
The formatter versions wrap Hindi strings differently. The prior focused
check therefore passed locally while the locked hosted formatter rejected
ten lines. This is a tool-version mismatch, not a translation change.

An isolated official `prettier@3.9.10` package reproduces the failure against
the exact parent file. Formatting that file with the locked version changes
only ten line wraps. The same locked formatting check and scoped strict
ESLint then pass. No CI assertion, warning policy or deadline changes.
The existing hosted lint/format jobs verify the correction; their result for
the next published commit remains required.

The [checksummed evidence](data/ci-locked-prettier.tar.gz) contains the raw
445-line job log, annotations, exact-head job metadata, parent locale,
before/after formatter results, scoped lint output and formatter versions.
This correction does not complete any remaining issue-wide product criterion.
