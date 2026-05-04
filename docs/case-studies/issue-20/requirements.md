# Requirements

Issue #20 requires both a CI/CD fix and a durable analysis record. The
requirements below are written as verifiable items for PR #21.

| ID     | Requirement                                                                                        | Status                    |
| ------ | -------------------------------------------------------------------------------------------------- | ------------------------- |
| R20-1  | Read the full issue, issue comments, PR comments, PR review comments, and PR reviews.              | Done                      |
| R20-2  | Download the failed workflow run metadata and logs into `docs/case-studies/issue-20`.              | Done                      |
| R20-3  | Reconstruct the failure timeline from saved logs and metadata.                                     | Done                      |
| R20-4  | Identify the real root cause of the CI failure, not just the failing job name.                     | Done                      |
| R20-5  | Compare the repository's CI/CD setup with the linked JS, Rust, Python, and C# templates.           | Done                      |
| R20-6  | Search external sources for additional facts that explain the failure mode and CI patterns.        | Done                      |
| R20-7  | Report whether the same issue exists in any linked template and whether upstream action is needed. | Done                      |
| R20-8  | Propose possible solution options and choose the least risky plan.                                 | Done                      |
| R20-9  | Add an automated regression test before finalizing the fix.                                        | Done                      |
| R20-10 | Implement a narrowly scoped fix that addresses the root cause.                                     | Done                      |
| R20-11 | Run focused local checks against the failing component.                                            | Done                      |
| R20-12 | Run broader local CI-style checks before pushing.                                                  | Done                      |
| R20-13 | Add a changeset for the code fix.                                                                  | Done                      |
| R20-14 | Update PR #21 title and description with reproduction, fix, tests, and case-study links.           | Pending before final push |
| R20-15 | Mark PR #21 ready for review after the branch is pushed and verified.                              | Pending before final push |
| R20-16 | Check post-push CI runs for the branch and download fresh failed logs if any job fails.            | Pending after push        |

## Non-Requirements

- Do not remove the Windows Deno matrix cell. It found a real bug.
- Do not hide the error with `continue-on-error`.
- Do not increase workflow timeouts to mask pending promises.
- Do not change release automation unless the root cause is in the
  workflow. The evidence points to storage transaction ordering.
