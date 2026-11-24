# Private PDF discovery after deletion

The exact `1f0c7287b7869c2a41fea826c84723607d3156dd` hosted browser
lanes fail the same fixture assertion in
[PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
Chromium reports `discovery never writes a saved PDF selection` at log
line 1460; WebKit reports it at line 1254. The complete job logs and exact
workflow metadata are preserved in the evidence archive below.

## Root cause and correction

The preceding native scenario saves a selected PDF, verifies its uploads,
deletes the selection and confirms that subsequent plans offer no selected
PDF. The server's causal store hides that deletion from application reads,
while the injected raw memory store retains its deletion clock and marker.
The later conventional-PDF scenario incorrectly requires that raw read to be
`null`. Its standalone local run starts with no saved selection, so it does
not reproduce the integration sequence.

The fixture now snapshots the raw record before discovery and requires exact
deep equality afterward. This verifies both an initially absent selection and
a retained causal deletion without accepting an accidental discovery write,
deletion-clock change or resurrection. Production storage, selection
precedence, PDF discovery and upload behavior are unchanged.

A focused native mode runs the actual saved-PDF/delete, private-PDF and
private-model scenarios consecutively. The normal mandatory browser group
retains the full sequence in both hosted lanes and its existing deadline.

## Reproduction and verification

```sh
python3 -B experiments/issue-56/forms-resume-recovery-before.py
RUN_BROWSER_E2E=1 FORMS_RESUME_RECOVERY_ONLY=1 E2E_EXECUTABLE_PATH=/usr/bin/google-chrome node --max-old-space-size=384 js/tests/e2e-forms-reader-browser.mjs
```

The first command temporarily restores the exact published assertion and
reproduces the failure after actual native save/delete; it restores the
current helper in `finally`. The corrected sequence passes in Chromium:
actual cross-origin PDF digests match, changed private inputs refuse before
upload/typing, the owner attachment and answers remain intact, private model
replanning makes two calls, all review windows close and submissions stay zero.
The conventional-PDF receipt separately confirms `savedSelectionUnchanged`.
Scoped lint, formatting, secret scanning and diff checks pass. Full local
runtime/browser matrices are not run.

The [source-bound archive](data/ci-forms-resume-recovery.tar.gz) and
[per-file hashes](data/ci-forms-resume-recovery.tar.sha256.json) preserve both
hosted failures, actual-parent reproduction, corrected native receipts,
assertion sources and relevant causal/discovery implementation. This is a
fixture correction; QA22/QA23 and all other unfinished requirements still
require complete exact-source hosted verification and manual acceptance.
