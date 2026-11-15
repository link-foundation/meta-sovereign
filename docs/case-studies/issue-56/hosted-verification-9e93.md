# Hosted verification on 9e934842

All five workflows use exact published head
`9e934842f76ac8bfeb43da26a5b55ef964da7526`, created at
2026-11-15 06:12:42–43 UTC. Every workflow passes; all 66 jobs finish
with success or an intentional skip. Checks completes at 06:44:54 UTC,
including every Chromium/WebKit shard and Windows/macOS/Linux runtime job.

| Workflow                 | Exact run                                                                                 | Jobs |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---- |
| Checks and release       | [43684401099](https://github.com/link-foundation/meta-sovereign/actions/runs/43684401099) | 48   |
| Desktop release          | [43684401109](https://github.com/link-foundation/meta-sovereign/actions/runs/43684401109) | 7    |
| Deploy to GitHub Pages   | [43684401065](https://github.com/link-foundation/meta-sovereign/actions/runs/43684401065) | 4    |
| Scheduled security audit | [43684401049](https://github.com/link-foundation/meta-sovereign/actions/runs/43684401049) | 6    |
| Broken Link Checker      | [43684401140](https://github.com/link-foundation/meta-sovereign/actions/runs/43684401140) | 1    |

The [checked metadata archive](data/hosted-verification-9e93.tar.gz) and
[manifest](data/hosted-verification-9e93.tar.sha256.json) preserve complete
workflow/job identifiers, timestamps, SHA and conclusions. The reusable
collector verifies the exact SHA, all five successful workflows and no
failed jobs. Full local runtime/browser matrices were not run.

Together with its [focused evidence](vk-attachments.md), this verifies
VK09: first-observed incoming attachment metadata, retained pause/restart,
cursor recovery, CLI/default Lino/offline controls and the shared translated
connection panel. **70 of 113 inventory rows remain unchecked.** The later
online-status unit requires its own exact-head checks. Every unmet original
criterion remains active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which stays draft and unmerged.
