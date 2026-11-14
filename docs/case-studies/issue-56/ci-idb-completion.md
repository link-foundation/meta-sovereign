# Complete the minimal IndexedDB fixture after its requests

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains
draft. For exact published head `80e93aa5`,
[Windows Node job 132170643616](https://github.com/link-foundation/meta-sovereign/actions/runs/43507470753/job/132170643616)
fails its minimal IndexedDB shim case. The preserved 8,186-line job log has
the failure at lines 8158–8165: `STORE_SNAPSHOT_CHANGED`, thrown from the
atomic transaction's read callback. Lines 8145–8152 report 5,455 passed,
one failed and six skipped tests. This is not the newer reply-cache code,
which was not present in that commit.

The tiny fixture completed every transaction on a four-millisecond timer,
regardless of pending requests. Production now correctly reads and writes
inside the same native transaction. Its nested put can therefore remain
pending when that unrelated timer acknowledges completion, allowing the
next expected revision to advance before the previous write exists.

A finite exact-parent replay delays only the shim's two request callbacks
to ten milliseconds and asserts durable readback immediately after the
acknowledged put. It fails with `a completed transaction must contain its
nested write`, actual `undefined`. Run
`node experiments/issue-56/idb-completion-before.mjs`; the script checks the
expected failure and removes its owned temporary test afterward.

The corrected fixture counts pending requests, including those created by
request callbacks, and completes only after that tree drains. It supports
abort and keeps the deliberate ten-millisecond requests. The same durable
readback assertion and all six focused browser-store tests pass, with a
finite two-second case deadline. The unrelated five-millisecond settling
sleep is removed. Production storage, native atomic comparison and CI
deadlines are unchanged. Scoped lint/format and diff checks pass.

The [archive](data/ci-idb-completion.tar.gz) and
[manifest](data/ci-idb-completion.tar.sha256.json) retain the full hosted log,
exact run metadata, parent source, finite failing replay and passing check.
Hosted Windows verification is still required. Windows Deno initial CLI
readiness and every unchecked original issue requirement remain unfinished.
