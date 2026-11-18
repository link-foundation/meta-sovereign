# Private vacancy cache migration

The pinned HH contract requires automatic copying of old ignored
`data/vacancies/<id>.lino` records, complete employer text and HTML, preservation
of originals, and no replacement of existing app records. The reference
[`vacancy-cache.mjs`](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/src/vacancy-cache.mjs)
implements that migration before cache access. Published parent `997b0dd2`
has no equivalent shared-store path. Twelve regressions fail against that
actual parent; an unrelated empty-store control passes.

Collection, cached reads, search exclusion and technology analysis now await
one sequential migration per opened store. Every explicit store can read its
own `vacancies/` folder. Only the default store also discovers the prior
`~/.hh-automation/vacancies/` app cache (or server-side `VACANCY_CACHE_DIR`)
and the old repository's `data/vacancies/` folder. Existing private app records
take precedence over repository records. HTTP input cannot select host paths.
The same automatic recovery serves CLI, both Lino API formats and the existing
CV controls; there is no provider request or action during migration.

Each original is retained as exact UTF-8 Lino with its SHA-256, filename and
canonical cache identity in a private `vacancy-legacy:` record. This preserves
unknown metadata, requirement/preference lists, quoting, whitespace and HTML
even when the current display projection does not interpret a field. Source
files are read without changing or deleting them. Numeric filenames, source
IDs and optional HH URLs must agree. Duplicate fields, malformed notation,
invalid snapshots, non-UTF-8 data and unsafe files are refused and counted in
the `cacheMigration` receipt. HTML remains data and is never rendered.

Files are read one at a time, with a 512,000-byte maximum and parser depth four.
A pass refuses after 10,000 eligible filenames rather than claiming complete
migration beyond that bound. Directories/symlinks cannot masquerade as files.
The completion marker is acknowledged only after the snapshot is persisted;
failed saves restore the previous cache and remain retryable. Later owner
deletions are retained across reopen. Conditional admission preserves a newer
concurrent snapshot without changing its causal clock. Recovery also retains
an owner replacement made after a failed import admission. Default-off
`MS_JOBS_CACHE_DEBUG=1` emits only aggregate import/existing/invalid counts.

## Reproduction and verification

Run `python -B experiments/issue-56/vacancy-legacy-before.py` for the actual
parent comparison. The script restores all three production files afterward.
Run the focused checks with one worker:

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=10000 js/tests/vacancy-legacy.test.js js/tests/vacancy-html.test.js js/tests/job-vacancy-cache-durability.test.js
deno test --allow-all js/tests/vacancy-legacy.test.js js/tests/vacancy-html.test.js js/tests/job-vacancy-cache-durability.test.js
```

All 32 checks pass in each runtime, including 13 migration cases. Scoped
lint, formatting, secrets and diff checks pass. The initial fixture used JSON
escapes instead of native Lino quoting; the failing log is retained, and the
corrected fixture verifies actual multiline text/HTML. No full suite, source
build, browser matrix or authenticated provider operation was run locally.
The source-bound [evidence archive](data/vacancy-legacy-cache.tar.gz) retains
both parent sources and full logs. Exact-source hosted verification remains
required. HH03 and all other unfinished criteria remain open in
[PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
