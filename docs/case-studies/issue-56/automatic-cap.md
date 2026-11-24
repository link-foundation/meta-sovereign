# Atomic automatic send capacity

Automatic batch senders read remaining daily capacity before sending. Two
simultaneous snapshots for different recipients could both consume the last
slot. Single-step autopilot delivery bypassed that batch check entirely,
including when a durable `sent`, `sending` or `unknown` receipt already consumed
the owner's capacity.

Serialize shared outbox admission per store, count the owner's durable receipts
and ledger immediately before reserving the next intent, and flush that intent
before issuing the provider operation. Provider requests run outside the
admission queue, so an unrelated owner can proceed while a response is held.
Automatic batch and single-step delivery share the same reservation. A capacity
race stops the remaining batch or returns the autopilot to its ordinary durable
wait without counting a send failure. Explicitly reviewed individual sends keep
their existing owner-confirmation policy.

Reproduce the final finite regression against published parent `6f7bdd6f`:

```sh
python3 -B experiments/issue-56/probe-automatic-cap.py
```

The final 36-check file produces **24 failures and 12 passes** on that parent,
with zero cancellations or skips. The probe restores all four production files
in `finally`. Earlier exploratory logs remain separately named: an initial
25-check runner-only probe exposed 15 failures but missed the simultaneous
snapshot race; the subsequent 30-check probe exposed 20 failures. The final
fixture uses the actual paced sender, delivery and durable outbox to reproduce
that race without artificial sleeps.

After correction, **90 focused checks pass** with one worker, zero failures,
cancellations or skips:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 \
  js/tests/automatic-cap.test.js js/tests/send-safety.test.js \
  js/tests/automations.test.js js/tests/automation-next.test.js \
  js/tests/question-outbox-flush.test.js js/tests/vk-queue-runner.test.js
```

The new checks cover five shared provider identities (`hh`, `telegram`, `vk`,
`email`, `whatsapp`), disjoint concurrent recipients, batch/step overlap and
ledger-free durable receipts. Positive controls retain capacity after a definite
refusal, hold it after uncertainty, recover after a refused capacity read,
admit an independent owner while another provider response is held, and retain
explicit owner-reviewed sends. The autopilot race checks the requested one-day
wait without sleeping for it and drains its owned task in `finally`.

These are finite synthetic adapter checks, with no live provider credentials or
effects. The collector preserves exact parent sources, final sources and tests,
verification logs, the rebuilt production bundle hash and an independently
checked archive manifest. Full provider behavior and exact-source hosted
verification remain required. QA20 is still unfinished: **83 of 118 criteria are
accepted and 35 remain unfinished**. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
