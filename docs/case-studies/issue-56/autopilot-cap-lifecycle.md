# Autopilot cap lifecycle

The automatic-cap admission correction exposed a stale lifecycle assumption:
the autopilot used its startup automation throughout the loop. If the owner
lowered the saved limit while a step planned, actual delivery correctly refused
capacity but the next loop still saw the old higher limit and planned again.
The finite regression refuses that second planning attempt immediately; it does
not run an unbounded busy-loop experiment.

An independently configured zero daily cap with an empty ledger also produced
`Math.min(...[]) === Infinity`; formatting its wake time failed with
`Invalid time value`. Reread the saved automation at each loop boundary and
use a one-day finite cap wait when there is no receipt expiry. Existing receipt
expiries, including future timestamps, retain their original semantics. Zero
capacity still issues no provider operation and does not count a send failure.

Reproduce both failures against published parent `448c2234`:

```sh
python3 -B experiments/issue-56/probe-autopilot-cap-lifecycle.py
```

The final four-check probe produces **two failures and two positive passes**,
with zero cancellations or skips. The initial two-check log is preserved
separately. The probe restores the exact working source in `finally`.

After correction, **72 focused checks pass**, with one worker and zero failures,
cancellations or skips:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 \
  js/tests/autopilot-cap-lifecycle.test.js js/tests/automatic-cap.test.js \
  js/tests/send-safety.test.js js/tests/automation-next.test.js
```

The cap-change case uses the actual runner's saved-action loading and single-step
delivery. The test scheduler records the requested delay instead of sleeping
for a day, and every owned wait drains after Stop. No live provider, user server
or full local matrix is used. The checked archive retains exact parent/final
sources, fixtures, logs and the rebuilt production bundle hash.

QA20 and exact-source hosted verification remain required. **83 of 118 criteria
are accepted; 35 remain unfinished.** [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
