# CLI output completion and CI investigation

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) preserves final CLI output before exit. The [Checks run 42968481378](https://github.com/link-foundation/meta-sovereign/actions/runs/42968481378), created **2026-11-11 05:51:38 UTC** for `9feb1d62fd70f48fbe9d1e4e191bb2877f59e03d`, completed with two runtime failures and the dependent pipeline failure. Both browser lanes, native checks and all three macOS Node shards passed. This is the completed preceding run, not a result for the new fix.

## Actual failures

- Windows Deno job **130352711883**, raw log lines **9825–9841**: the prepared UI upgrade exits zero but `/server upgraded/` is missing. Captured output stops after “preparing the installed version”. Earlier lines **7084–7104** retain the immediate assertion. The test resolved its output snapshot on child `exit`, before stdio closure; the CLI also called `process.exit()` immediately after its final log.
- Ubuntu Node job **130352712296**, raw log lines **5855–5864**: unrelated template-history seeding returns `assignment-seed-unverified`. Exact failing Git stderr was unavailable. Bounded private command stderr and default-off identifier/byte-count tracing are now retained; only the synthetic Git fixture prints its exact failed command. Local tiny-history checks pass. **The Git failure's root cause remains unconfirmed** and the next hosted run must supply evidence if it repeats.
- Pipeline job **130362160587** correctly reports the preceding failures. Full workflow and all three failed-job logs are preserved in the archive.

## Reproducer and correction

The [finite probe](../../../experiments/issue-56/cli-delayed-output.mjs) runs the actual CLI entry point with one delayed stdout sink. It emits one version line or bounded help output; no stress input, network or persistent server is involved. Two regressions in [cli-output.test.js](../../../js/tests/cli-output.test.js) fail on parent `2329461b`: both commands retain their expected exit code while losing all output. The [reproducer](../../../experiments/issue-56/cli-output-before.py) restores the working entry point in `finally`.

The entry point now sets `process.exitCode` and permits pending work to drain. The rolling CLI fixture waits for `close` before reading captured output. This follows the primary [process exit guidance](https://nodejs.org/api/process.html#processexitcode) and [child stdio lifecycle](https://nodejs.org/api/child_process.html#event-close). The private-stderr fixture also drains its write before exit. The finite reproducer proves the production truncation bug; attributing the exact Windows incident to either output race remains an inference until hosted verification.

Verification:

- Both new Node output checks pass after the change; the parent fails both.
- Deno passes all four focused output/rolling CLI checks, including prepared-worker upgrade, unchanged port/host identity, actual HTTP readback and changed-snapshot refusal.
- A combined local Node run passed the two output checks and snapshot check but failed initial host readiness and cleanup. Its complete log is retained. A targeted run with the existing lifecycle trace then passed the complete rolling CLI upgrade in 14 seconds. No deadlines, retries or assertions were relaxed. This startup observation remains separate from the proven output correction.
- Scoped ESLint, formatting and secret checks are recorded with this unit. Full runtime/browser matrices remain in hosted CI.

The [archive](data/ci-cli-output.tar.gz) and adjacent SHA-256 manifest preserve exact-head metadata, downloaded logs, primary documentation, before/after source and finite checks. Issue 56 and every unchecked requirement remain unfinished; PR 57 stays draft and unmerged.
