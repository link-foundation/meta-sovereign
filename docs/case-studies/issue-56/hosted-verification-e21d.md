# Hosted verification on e21ddaa9

All five workflows use exact published head
`e21ddaa906ff5244a0233814b6a4a37f0fece3ce`, created at
2026-11-15 06:46:06 UTC. Every workflow passes; all 66 jobs finish
with success or an intentional skip. Checks completes at 07:15:40 UTC,
including every Chromium/WebKit shard and Windows/macOS/Linux runtime job.

| Workflow                 | Exact run                                                                                 | Jobs |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---- |
| Checks and release       | [43686933593](https://github.com/link-foundation/meta-sovereign/actions/runs/43686933593) | 48   |
| Desktop release          | [43686933579](https://github.com/link-foundation/meta-sovereign/actions/runs/43686933579) | 7    |
| Deploy to GitHub Pages   | [43686933669](https://github.com/link-foundation/meta-sovereign/actions/runs/43686933669) | 4    |
| Scheduled security audit | [43686933578](https://github.com/link-foundation/meta-sovereign/actions/runs/43686933578) | 6    |
| Broken Link Checker      | [43686933583](https://github.com/link-foundation/meta-sovereign/actions/runs/43686933583) | 1    |

The [checked metadata archive](data/hosted-verification-e21d.tar.gz) and
[manifest](data/hosted-verification-e21d.tar.sha256.json) preserve complete
workflow/job identifiers, timestamps, SHA and conclusions. The reusable
collector checks the exact SHA, all five successful workflows and no failed
jobs. Full local runtime/browser matrices were not run.

Together with its [focused evidence](vk-online.md), this verifies VK10:
explicit opt-in scheduling, acknowledged provider refreshes, durable attempts,
retained uncertainty, owned shutdown and shared CLI/default Lino/offline/
four-language controls. **69 of 113 inventory rows remain unchecked.** The
friend-request draft requires its own exact-head checks. Every unmet original
criterion remains active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which stays draft and unmerged.
