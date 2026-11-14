# Hosted parent-reproduction diagnostic

The Rust job for `74afe32cd09e3e940058797ba662fe689213c6e7` passed its native tests, then failed in the expected-parent investigation script. [Job 132362078388](https://github.com/link-foundation/meta-sovereign/actions/runs/43566409887/job/132362078388) is attached to the correct commit and started after that commit was published.

The preserved full job log has 1,031 lines. Lines 954–975 show the actual problem: `native-durable-before.py --sync` correctly observes that the old native CLI cannot reconcile the current JavaScript peer, but its assertion still requires the earlier `schema-13` wording. The interop experiment now reports `current-schema`. This is a stale expected-failure assertion, not evidence that the current native CLI failed reconciliation. The job stopped before it could run current-CLI interop.

The assertion now accepts the specific reconciliation diagnostic with either its historical numbered schema or the current-schema label. It still requires a failed process and rejects unrelated failures. The durable-write reproducer retains its original two specific assertions. No timeout, production transport, native schema negotiation or protocol behavior changes in this correction.

`PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/native-cargo-reference-check.py` passes locally. Its finite diagnostics cover three valid schema labels, three invalid/successful results, the durable-write refusal and replay of the preserved actual hosted failure. The same check runs before the hosted parent builds, so these assertions receive automated CI coverage. Its existing tiny std-only Cargo cache-isolation and warnings-denied documentation checks also pass; the full native dependency build remains on hosted CI.

The evidence bundle preserves the complete hosted job log, focused verification log, corrected scripts and source baseline. Current-head hosted checks remain required. This correction does not complete the remaining issue #56 criteria; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft and unmerged.
