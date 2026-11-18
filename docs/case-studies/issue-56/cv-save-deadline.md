# Reject late CV Save readback

PR: https://github.com/link-foundation/meta-sovereign/pull/57

## Reproduction and cause

On published parent `08cf9ee557380fdf8f9edd59e164cca7c34325c1`, a matching
export, newly created workplace list or exact workplace read can finish after
the verification deadline and still confirm the owner's Save. The deadline is
only tested between retries. The same problem permits another read after a
slow form probe. A finite logical-clock replay reproduces nine failures while
retaining two independent successful/cancellation controls:

```sh
python3 -B experiments/issue-56/cv-save-deadline-before.py
```

The replay temporarily restores the actual published verification module and
always restores the current source. It uses no browser, network, stress load or
provider writes.

## Correction and verification

The original deadline now applies after the poll, form probe and every awaited
export, identity-list and exact-record read, including failed reads. The default
clock is monotonic. At or after expiry, a result cannot confirm Save or start
another read. An observed still-open form retains its specific refusal; other
expired readback reports `jobs-cv-readback-timeout`. Owner cancellation takes
precedence. Existing reads still drain before the watcher detaches; this is not
a claim that an already issued browser read is forcibly interrupted at expiry.

The eleven new checks cover all five boundaries, both existing-record/About
paths, failed reads, the last admitted instant, cancellation and the actual
watcher publication path. A late matching result retains the acknowledged
snapshot and Save count; a subsequent fresh owner Save can succeed. Existing
identity, recovery, five-read, form-open, Stop and shared-interface checks pass:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/cv-save-deadline.test.js js/tests/cv-save-watch.test.js js/tests/cv-save-watch-recovery.test.js js/tests/cv-save-watch-controls.test.js js/tests/cv-created-workplace.test.js js/tests/cv-workplace-identity.test.js
```

All 54 focused checks pass. This changes shared readback acceptance, with no
visual layout change. Full runtime and browser matrices remain hosted checks
for the published source. The adjacent source-bound archive retains the exact
parent, failures, controls and corrected verification logs. HH18's complete
copy/save/detach workflow and all thirty unfinished criteria remain required;
acceptance remains 88/118 and PR57 stays draft/unmerged.
