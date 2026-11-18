# Fresh mutual-exclusion receipts

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The VD02 audit found a concrete stale observation: Start checked both modes
before mutation, then checked only the destination after launch. A peer that
became running or unobservable during launch was reported as stopped. An SSH
alias sharing the local Screen namespace can reveal both targets running after
one launch. Idempotent Start could also accept an earlier stopped observation.

Six bounded regressions fail against the actual published `43e91c4f` controller:
running/unknown peers after launch in both directions and changed peers before
accepting either already-running destination. The correction refreshes the peer
at both acknowledgement boundaries and returns the existing unconfirmed-stop
receipt with actual observations. It never repeats a Start or Stop to recover.
Cancellation also prevents a successful launch receipt.

```sh
python3 -B experiments/issue-56/runner-exclusive-receipt-before.py
node --test --test-concurrency=1 js/tests/runner-exclusive-receipt.test.js js/tests/runner-control.test.js js/tests/runner-stop-drain.test.js js/tests/runner-screen.test.js js/tests/runner-docker.test.js js/tests/runner-controller.test.js js/tests/runner-inspection.test.js
```

All 46 focused checks pass with one worker. Existing switching, retained leases,
bounded drainage, Docker ownership and exact Screen identity checks remain.
Scoped static validation and hashed evidence accompany this correction. The
existing hosted runtime matrix automatically includes the new test file. Real
remote proofs and exact-source workflows remain required; VD02 and all other
32 unfinished criteria stay open. No UI layout or deadline changes.

Evidence: [archive](data/runner-exclusive-receipt.tar.gz),
[hash manifest](data/runner-exclusive-receipt.tar.sha256.json).
