# Scope the refreshed destination assertion

Checks run [43663110530](https://github.com/link-foundation/meta-sovereign/actions/runs/43663110530),
created 2026-11-15T01:26:35Z for exact commit
`0a6283651778b914102c6ddb49a19d29cbf80070`, fails Chromium shard 2/4,
job `132657458807`. The complete downloaded job has the strict locator error at
lines 1575–1587: `getByText('https://other.test/assignment', { exact: true })`
matches two code elements after a changed destination is freshly reviewed.

The current review legitimately includes the destination in both pending-turn
context and the latest-question preview. The fixture's broad locator treats
those two locations as ambiguous. A finite run of the unchanged published helper
reproduces the exact failure locally. The assertion now identifies the pending
turn, as its initial destination assertion already does, and still requires the
exact changed target to be visible. The UI, strict matching, deadlines and
delivery guards are unchanged.

```sh
RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome node experiments/issue-56/ci-question-link-locator.mjs
```

The corrected focused native Chromium run passes all four existing scenarios:
literal hidden destinations, stale refusal followed by one explicitly reviewed
positive receipt, frozen choice/text/prefill refusal and late pointer guards.
It reports zero page exceptions, no stale send, one fresh reply and closed owned
resources. Strict scoped lint, formatting, secrets and diff checks pass. Hosted
browser coverage remains in the same mandatory question-templates group, with
the existing engines and budgets.

The [checked archive](data/ci-question-link-locator.tar.gz) and
[SHA-256 manifest](data/ci-question-link-locator.tar.sha256.json) preserve exact
metadata, the complete failing hosted job, actual parent/current helper and
focused failing/passing logs. The correction requires its own exact-head hosted
checks. Every unchecked original criterion remains active; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
