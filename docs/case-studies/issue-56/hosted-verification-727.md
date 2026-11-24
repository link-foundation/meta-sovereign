# Hosted verification on 727e361a

All five workflows use exact head `727e361a8c318a39bc8e23941a5bc41a80445f13`,
created at 2026-11-15 01:56:50 UTC after publication. Every workflow passes;
all 66 jobs finish with success or an intentional skip. Checks completes at
02:37:33 UTC, including every Chromium and WebKit shard.

| Workflow                 | Exact run                                                                                 | Jobs |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---- |
| Checks and release       | [43665431153](https://github.com/link-foundation/meta-sovereign/actions/runs/43665431153) | 48   |
| Desktop release          | [43665431125](https://github.com/link-foundation/meta-sovereign/actions/runs/43665431125) | 7    |
| Deploy to GitHub Pages   | [43665431135](https://github.com/link-foundation/meta-sovereign/actions/runs/43665431135) | 4    |
| Scheduled security audit | [43665431162](https://github.com/link-foundation/meta-sovereign/actions/runs/43665431162) | 6    |
| Broken Link Checker      | [43665431167](https://github.com/link-foundation/meta-sovereign/actions/runs/43665431167) | 1    |

The [checked metadata archive](data/hosted-verification-727.tar.gz) and
[manifest](data/hosted-verification-727.tar.sha256.json) preserve complete
workflow/job identifiers, SHA, timestamps and conclusions. The reusable
collector asserts the exact SHA, five completed successful workflows and no
failing jobs. Full local matrices were not run.

This completes hosted verification of [VK01 greeting catalogs and private-dialog guards](vk-greeting-catalog.md)
and the [refreshed-question locator correction](ci-question-link-locator.md).
Their reproduction, focused tests and native/MCP evidence remain linked in
those studies. VK01 is complete; 78 inventory rows remain unchecked.

The later gratitude implementation requires its own exact-head checks. Every
original unmet acceptance criterion remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays
draft and unmerged.
