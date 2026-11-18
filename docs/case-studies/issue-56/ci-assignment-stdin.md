# Successful assignment commands and unused stdin

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft;
all unchecked issue criteria remain active.

Checks run 42995004956 was created 2026-11-11 09:25:08 UTC for exact commit
`7e0e2f4d9f5ff4b1a279029b31348dbe87031f0f`. Ubuntu Node job 130438063887
reports `assignment-input` during the existing unrelated-template history test.
The complete downloaded job log, lines 5943–5954, points to the stdin error
handler in `assignments/commands.js:101`. This is separate from the Deno
fixture-import failure corrected in the summary-choice unit.

Every command opened a stdin pipe and called `end('')`, including Git operations
with no input. If the child's read end closes first, an unused empty write can
fail and record an input refusal even when the command exits zero. The CI log
identifies that error branch; it does not retain the underlying OS error code.
The deterministic regression injects EPIPE at that exact boundary and reproduces
the same refusal against actual parent `f7136b1e`. No timing loop or stress
processes are needed. The fixture restores the original spawn function in
`finally` and completes every simulated child.

Commands with empty string input now use ignored stdin. Payload-bearing commands
still own a pipe, write the exact body and refuse input errors. This prevents
false failures without treating failed payload delivery as success. Existing
private command diagnostics now also retain the input error code behind the
existing default-off question-turn logger. Command output remains private.
The default child-process module lookup makes the controlled regression work in
Node and Deno; Deno does not synchronize patched named builtin bindings.

Reproduction: `python3 experiments/issue-56/assignment-input-before.py` temporarily
restores the actual parent runner, runs the closed-unused-input regression,
requires its `assignment-input` failure and restores current source in `finally`.
The preceding log fails exactly one of two checks; payload behavior already passes.

After correction, seven focused Node and seven focused Deno checks pass. They
include both new input cases plus actual tiny Git histories: unrelated owner
history survives template seeding, deleted template pipelines are restored,
empty repositories receive source history, abort drains the child, and private
stderr stays bounded. No existing deadlines or checks are weakened. Hosted CI
verifies the full platform matrix for the pushed commit.

The [hashed evidence archive](data/assignment-input.tar.sha256.json) retains
before/after source, complete failed CI job logs and timestamp/SHA metadata,
focused runs and the reversible parent probe. The archive records failed
intermediate fixture experiments as well as final passing verification.
