# Personal-job compatibility and contribution checks

Review of VK15's shared executor found its new receipt step label replaced VK14's
existing `greeting-and-question` label. The actual published `29b14f72` parent
fails the durable reopen regression on that exact field. Give the shared executor
an optional policy step and retain VK14's prior receipt identity. No existing
record requires conversion: the old value remains authoritative for future
follow-up receipts, and already persisted records remain unchanged.

Split admission, history/cooldown, provider validation and delivery-outcome helpers
to keep every changed production function below the contribution guide's
complexity limit. The same focused policy, late-input, durable-recovery and owned
lifecycle cases verify these extractions. The initially captured undefined local
in the draft extraction is retained as a transcript copy after the original lint file was overwritten; it was corrected before
verification. No failed draft is reported as passing.

The new greeting usage guide now has equivalent English, Russian, Hindi and
Chinese pages and reciprocal language links. This unit changes no UI rendering.
It retains the prior feature's native/MCP screenshot evidence and requires the new
head's full hosted matrix. The [checked archive](data/vk-personal-quality.tar.gz) and
[manifest](data/vk-personal-quality.tar.sha256.json) preserve actual-parent production bytes,
the reproducing test, focused receipts, strict zero-warning lint, format, secrets,
unchanged duplication gate and every final source hash.

[Feature evidence](vk-greet.md). [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
remains draft and unmerged. Every unchecked inventory criterion stays required.

GitHub refuses `gh pr diff` with HTTP 406 because this cumulative PR exceeds its
300-file diff limit. Review uses the local base/commit comparisons instead; the
preserved error is an API display limit, not an unmet implementation criterion.
