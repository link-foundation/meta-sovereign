# Hosted verification on 2733ff54

All five workflows use exact published head
`2733ff547c233d0207ef37309464fd4b4c70e430`, created at
2026-11-15 05:30:53 UTC. Every workflow passes; all 66 jobs finish with
success or an intentional skip. Checks completes at 06:11:03 UTC, including
every Chromium and WebKit shard and the Windows/macOS/Linux runtime checks.

| Workflow                 | Exact run                                                                                 | Jobs |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---- |
| Checks and release       | [43681395980](https://github.com/link-foundation/meta-sovereign/actions/runs/43681395980) | 48   |
| Desktop release          | [43681395812](https://github.com/link-foundation/meta-sovereign/actions/runs/43681395812) | 7    |
| Deploy to GitHub Pages   | [43681395802](https://github.com/link-foundation/meta-sovereign/actions/runs/43681395802) | 4    |
| Scheduled security audit | [43681395803](https://github.com/link-foundation/meta-sovereign/actions/runs/43681395803) | 6    |
| Broken Link Checker      | [43681395866](https://github.com/link-foundation/meta-sovereign/actions/runs/43681395866) | 1    |

The [checked metadata archive](data/hosted-verification-2733.tar.gz) and
[manifest](data/hosted-verification-2733.tar.sha256.json) preserve complete
workflow/job identifiers, timestamps, SHA and conclusions. The reusable
collector asserts the exact SHA, five successful completed workflows and
no failed jobs. Full local runtime/browser matrices were not run.

Together with their linked focused reproductions, CLI/default Lino tests,
native before/after screenshots and independent four-language MCP review,
this verifies VK02–VK08: [gratitude](vk-gratitude.md),
[identity/address preference](vk-identity.md),
[acquaintance/daily cooldown](vk-acquaintance.md),
[first exchange, well-being/purpose and clarification](vk-contextual.md),
and [ordered sticker/introduction follow-up](vk-engagement.md).
It also verifies the [catalog contract correction](ci-preset-catalog.md)
and [sync fixture bundle correction](ci-sync-fixture-bundle.md).

Seven inventory rows are now checked; **71 remain unchecked**. The later
VK09 attachment collector requires its own exact-head checks. Every unmet
original acceptance criterion remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which
stays draft and unmerged.
