# Foreground queue ownership after close

Checks run `43737908926` tests published `aee0a2ec0c2445a0a39c61ac6c4c6cf91f5129f3`,
created November 15, 2026 at 16:52:28 UTC. Four existing CLI cases fail in
eight Node, Deno and Bun jobs on Windows, macOS and Linux. Preserved job logs show the
same `VK outgoing queue stopped` result; the Node log records the assertions at
lines 3503, 3520, 3537 and 3561. This is a current-commit regression.

Each foreground command closes its owned runner correctly after awaiting the
handler. The shared per-store registry retained that closed queue, so the next
command could plan drafts but could not send its reviewed selection. Reproduce
the four existing failures with `node --test js/tests/automation-cli.test.js` on
the parent. The finite `experiments/issue-56/vk-queue-lifecycle-before.py` also
reproduces the registry's object-identity assertion on the actual parent.

The registry now replaces a stopped queue only after its active operation and
all waiting admissions drain. During close, another owner receives the stopped
queue and cannot overlap its native effect. After drain, a new explicit owner
gets a fresh queue; closing the previous object again cannot stop its successor.
No persisted work is replayed. Existing optional queue tracing remains off by
default and excludes message bodies and credentials.

Thirty-one focused Node and Deno checks cover the lifecycle regression, all
eight existing CLI cases, pacing, interface and runner compatibility. The
unchanged lint, format, secret and duplication gates are checked. Source bytes,
the actual-parent failure, initial probe diagnostics, focused results and eight
hosted job logs are retained in [the checked archive](data/vk-queue-lifecycle.tar.gz)
and [hash manifest](data/vk-queue-lifecycle.tar.sha256.json).

Fresh exact-head hosted verification remains required. Every unchecked original
criterion stays required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which remains draft and unmerged.
