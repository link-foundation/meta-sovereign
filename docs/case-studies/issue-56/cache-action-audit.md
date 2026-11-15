# Checkout-dependent cache audit exception

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
This correction does not accept the remaining issue #56 requirements.

The run for `ea0c506e` at 2026-11-15 20:32:12 UTC passed all runtime
and browser jobs. Its workflow audit alone failed: the preserved
`ci-logs/vk-token-ea0-audit.log`, lines 454–470, identifies `self-repository`
at `release.yml:469`. The pinned scanner recommends `$/...` for this
checkout-dependent cache step. Earlier macOS setup logs demonstrate that
this syntax downloads the whole repository archive before the checkout
and can consume the runtime job's deadline; see [the prior investigation](runner-log-ci.md).

The runtime job deliberately executes the cache action from the already
checked-out fresh merge. A single documented inline exception suppresses
only that syntax recommendation. Cache writers, permissions, keys, other
workflow audits and the terminal pipeline gate remain enforced. The
contract test requires this exception to stay scoped to the cache action;
the existing contract continues to require checkout first.

Reproduce with the pinned `zizmor==1.32.0` available on PATH:

```sh
python3 -B experiments/issue-56/cache-action-audit.py --before
# Exit 12: the actual self-repository recommendation.
python3 -B experiments/issue-56/cache-action-audit.py
# Exit 0: no findings; the remaining audits are still enabled.
node --test --test-concurrency=1 js/tests/ci-cache-policy.test.js
# Three focused contracts pass.
```

The [evidence archive](data/cache-action-audit.tar.gz) includes the original
hosted log, before/after scanner output, focused tests, source snapshots
and per-entry hashes. Exact-head hosted verification remains required.
