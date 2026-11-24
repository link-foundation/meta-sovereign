# Getter-safe error diagnostics

Published commit `54c952479634ce8a589b2a19c2e4a83f991d0387` failed
[Windows/Bun job 132908490131](https://github.com/link-foundation/meta-sovereign/actions/runs/43744999725/job/132908490131).
The preserved job log reports `true !== false` in
`log formatting avoids getters, toJSON and cycles` at lines 3054–3068:
formatting invoked a message getter. The other 6,497 cases passed, with 13
skipped. This is an actual hosted failure, distinct from the finite local model.
The next published head `8bb1595f` repeats the same failure in
[job 132913449590](https://github.com/link-foundation/meta-sovereign/actions/runs/43746863135/job/132913449590),
at lines 3049–3063, with 6,504 passing and 13 skipped cases. Both complete logs
are preserved, including commit/timestamp metadata.

`Object.getOwnPropertyDescriptors(error)` can materialize a runtime's lazy native
stack. That formatting can read `name` or `message`, even though the caller is
inspecting descriptors. The logger now identifies errors before general object
inspection, reads their name/message data descriptors through a bounded prototype
walk, and inspects a stack only with string fields and no custom stack formatter.
Unsafe stacks retain an explicit `[accessor]` marker; ordinary error identity,
redacted messages and ordinary native stacks remain useful. Traversal, cycle and
size limits are preserved.

The new regression models native lazy materialization with a descriptor proxy,
covering own and inherited name/message accessors. Against parent `514c524f`,
one getter is invoked; the corrected implementation invokes none. A separate
finite child process owns a custom global stack formatter so Bun's retained
native hook state cannot affect other tests. Non-string message fields are never
coerced. A second parent regression exposed short `token=...` fields at the
beginning of a message; shared redaction now also recognizes that boundary.

Reproduce both original regressions without retaining source mutations:

```sh
python3 experiments/issue-56/log-error-before.py
node --test --test-concurrency=1 --test-timeout=20000 js/tests/log-error.test.js js/tests/diagnostics.test.js js/tests/redact-log.test.js
```

Eighteen focused checks pass on Node, Bun and Deno. Linux Bun did not reproduce
the actual Windows-only failure directly; the controlled lazy-stack regression
does fail against the original production logger. A rebuilt web bundle includes
the shared redaction boundary correction. No provider or application session is
used by these checks.

The same old workflow has four cancelled browser jobs. Their complete logs retain
cancellation at lines 430 (WebKit 1/4), 733 (WebKit 3/4), 1287 (Chromium 3/4) and
649 (WebKit 2/4). Two stopped during setup and two during unfinished browser
groups. They are incomplete verification, not successful checks. New exact-head
hosted acceptance remains required. All 60 unchecked inventory requirements stay
active and [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
remains draft and unmerged.

[Checked source and log archive](data/ci-log-getter.tar.gz) ·
[Hash manifest](data/ci-log-getter.tar.sha256.json)
