# Hosted verification on d34db92c

PR [#57](https://github.com/link-foundation/meta-sovereign/pull/57), 2026-11-15.
All five workflows use exact head `d34db92c18886e741c91af906d2d2a975c0c14c6`
and were created at 00:36:06–07 UTC after its publication. Every workflow passes;
all 66 jobs finish with success or an intentional skip. The final Checks run
finishes at 01:06:39 UTC, including all Chromium and WebKit shards.

| Workflow                 | Exact run                                                                                 | Jobs |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---- |
| Checks and release       | [43658983925](https://github.com/link-foundation/meta-sovereign/actions/runs/43658983925) | 48   |
| Desktop release          | [43658983920](https://github.com/link-foundation/meta-sovereign/actions/runs/43658983920) | 7    |
| Deploy to GitHub Pages   | [43658983877](https://github.com/link-foundation/meta-sovereign/actions/runs/43658983877) | 4    |
| Broken Link Checker      | [43658983898](https://github.com/link-foundation/meta-sovereign/actions/runs/43658983898) | 1    |
| Scheduled security audit | [43658983989](https://github.com/link-foundation/meta-sovereign/actions/runs/43658983989) | 6    |

The [checked metadata archive](data/hosted-verification-d34.tar.gz) and
[manifest](data/hosted-verification-d34.tar.sha256.json) preserve the full
workflow/job IDs, SHA, timestamps, statuses and conclusions. The local audit
asserts exact SHA, completed successful workflows and no failing jobs.

This satisfies the remaining hosted verification for [QA03 saved templates](question-templates.md)
and [VD10 landing availability](desktop-landing-availability.md), whose finite
local, CLI/API and native/MCP evidence is already preserved. Those two inventory
rows are complete. It also verifies the [selection clock correction](ci-selection-clock.md)
against the original browser matrices.

The later structured Telegram correction `7ba65f1e` requires its own exact-head
checks. The 79 remaining unchecked inventory rows and all original unmet issue
requirements stay active; PR57 remains draft and unmerged.
