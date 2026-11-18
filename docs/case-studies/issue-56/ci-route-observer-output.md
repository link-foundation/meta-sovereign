# Preserve the route observer's separate output streams

On exact source `b868a82b4a2c26f1f285965037aedd43467babd9`,
[run 43935461844](https://github.com/link-foundation/meta-sovereign/actions/runs/43935461844)
was created at 2026-11-16 19:04:24 UTC. Windows Node shard 1/3, job
133541760585, fails the fresh-process route observer. Its unchanged raw log
lines 4014–4020 show `SyntaxError` while parsing `[lifecycle]` as JSON;
lines 4003–4006 report 2,353 passing tests and this single failure.

The observer combined stderr diagnostics with its stdout JSON receipt.
The lifecycle logger correctly writes to stderr when `MS_LIFECYCLE_DEBUG=1`.
The test now keeps the streams separate, retains both on child failure and
explicitly enables tracing so every focused run verifies the same boundary.
It still requires successful child exit, valid JSON, all three observed route
modules and the final lifecycle checkpoint. Production logging, import guards,
deadlines and CI partitions are unchanged.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/route-output-before.py
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/route-loading.test.js
```

The first command reproduces the JSON failure against the exact published
parent and restores current source unconditionally. Both focused checks pass
afterward. This test correction accepts no original criterion. Fresh hosted
verification and all 60 unchecked requirements remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

[Source and raw evidence](data/ci-route-observer-output.tar.gz) and
[hash manifest](data/ci-route-observer-output.tar.sha256.json).
