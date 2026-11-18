# Batch CLI admission correction

Both finite-batch commands were registered in the ordinary command module, but
omitted from its lightweight admission catalog. The public entrypoint therefore
printed usage and returned status 1 before either handler could run. Adding the
two existing names restores start-file validation and saved-status access while
preserving the lightweight help path and unknown-command behavior.

## Hosted failure and reproduction

[Checks 43629631473](https://github.com/link-foundation/meta-sovereign/actions/runs/43629631473)
was created at 2026-11-14 18:59:45 UTC for exact published head
`281d6dcc2201a9c39d8b70ed07447ec84321fea9`. Eight completed Node, Deno and Bun
runtime jobs fail the complete-registration regression at
`cli-help-imports.test.js:51`. Their complete job logs are retained. For example,
macOS Node job `132554838248`, lines 3145–3166, and macOS Deno job
`132554838347`, lines 11608–11629, identify the same two absent names. Ubuntu
Node job `132554838344`, lines 7150–7178, reports the same assertion. Four
companion workflows pass; unfinished browser/runtime jobs are not reported as
passing.

The finite regression selects actual published sources and restores them in
`finally`:

```sh
python3 -B experiments/issue-56/batch-cli-admission-before.py
```

The parent fails two cases: the existing complete-catalog comparison and a new
public-entry regression. The latter expects a missing vacancy file to raise
ENOENT without opening a workspace, then reads an empty saved batch receipt.
Before the correction it receives usage instead of reaching file validation.
The test owns and removes its temporary workspace.

## Focused verification

```sh
node --max-old-space-size=384 --test --test-concurrency=1 \
  js/tests/cli-help-imports.test.js js/tests/cli-batch-admission.test.js \
  js/tests/cli-output.test.js js/tests/job-application-batch-controls.test.js
DENO_V8_FLAGS=--max-old-space-size=384 deno test --allow-all --no-check \
  js/tests/cli-help-imports.test.js js/tests/cli-batch-admission.test.js \
  js/tests/cli-output.test.js js/tests/job-application-batch-controls.test.js
```

Node passes all 12 cases. Deno passes 11 and explicitly ignores the
Node-specific import-hook probe. The selection retains delayed output,
text/binary Lino routes, finite foreground batch execution, stale-confirmation
refusal and four-language markup. The new test initially asserted an absent
top-level `active` field; it now compares the documented empty receipt. No
production receipt, timeout or CI coverage was changed to satisfy that assertion.

The [evidence archive](data/batch-cli-admission.tar.gz) and
[per-file hashes](data/batch-cli-admission.tar.sha256.json) preserve actual
parent/current sources, complete focused logs, all eight failing hosted job
logs and workflow metadata. Recreate them with
`python3 -B experiments/issue-56/collect-batch-cli-admission.py` after verification.
Exact-head hosted checks remain required after publication. All 81 original
incomplete inventory rows remain required; PR57 stays draft and unmerged.
