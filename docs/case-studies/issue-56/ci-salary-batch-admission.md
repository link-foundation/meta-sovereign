# Recover known fixture admission contention

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) run
[44201281756](https://github.com/link-foundation/meta-sovereign/actions/runs/44201281756/job/134457678515)
failed macOS Deno shard 5 at published `77bd5f71`. The preserved raw log records
1,256 passing checks, one failure and three intentionally ignored checks.
Lines 3619–3630 identify the salary-preservation refusal scenario's fixture
`application-read`, rejected with `jobs-busy` by `jobs/service.js:90`.

The finite batch fixture compresses a one-second observation interval to one
millisecond. Its status read waits for the current acknowledged writer, but
does not reserve the writer for the next manual action. While the test changes
the cached salary, the next background observation can acquire that writer.
The production refusal correctly occurs before the manual operation starts.
This contention is independent of the prior runner and browser-selector fixes.

Only the fixture caller changes. Its admission helper retries `jobs-busy` up to
200 attempts, separated by five milliseconds. Any other refusal or uncertain
result returns immediately. There is no production retry, ownership change,
larger test deadline, skipped test or relaxed salary-preservation assertion.
Existing assertions still require actual owner answers to remain open after a
private backup refusal, zero sends, zero closes and no lower salary tier.

The affected scenario now deterministically supplies one legitimate busy
admission before invoking the real operation. Restoring the actual parent caller
with that same setup fails with the hosted error; the corrected caller recovers
it. Additional checks require one invocation for backup/state/connection failures
and exactly 200 invocations on finite busy exhaustion. All 12 focused checks pass
in Node and Deno. The complete macOS/runtime matrix remains a hosted requirement.

The archive retains the original raw hosted log and job metadata, the unchanged
parent caller, the deterministic reproduction, focused Node/Deno receipts and
scoped static checks. This CI repair does not accept any unfinished feature
criterion. Inventory remains 83 verified and 35 unfinished; PR57 stays draft
and unmerged.
