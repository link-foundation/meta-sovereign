# Hosted verification on 3ea98ecc

All five workflows use exact published head
`3ea98ecc02691b967cc0723aa99cc6807caf625f`, created at
2026-11-15 12:12:15 UTC. They completed successfully, including all 75 jobs
with success or an intentional skip. The last WebKit partition finished before
the aggregate Checks status passed at 12:59:39 UTC. No pending or cancelled
matrix is counted as acceptance.

| Workflow                 | Exact run                                                                                 | Jobs |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---- |
| Checks and release       | [43712638812](https://github.com/link-foundation/meta-sovereign/actions/runs/43712638812) | 57   |
| Desktop release          | [43712638807](https://github.com/link-foundation/meta-sovereign/actions/runs/43712638807) | 7    |
| Deploy to GitHub Pages   | [43712638804](https://github.com/link-foundation/meta-sovereign/actions/runs/43712638804) | 4    |
| Scheduled security audit | [43712638810](https://github.com/link-foundation/meta-sovereign/actions/runs/43712638810) | 6    |
| Broken Link Checker      | [43712638918](https://github.com/link-foundation/meta-sovereign/actions/runs/43712638918) | 1    |

The checked [metadata archive](data/hosted-verification-3ea.tar.gz) and
[manifest](data/hosted-verification-3ea.tar.sha256.json) retain complete job IDs,
timestamps, exact SHA and conclusions. The existing collector requires five
successful completed workflows and rejects any failed or unfinished job.
Full runtime, platform and browser matrices ran in hosted CI.

Acceptance also requires the preserved reference and implementation audits,
actual-parent reproductions, focused regressions, native browser and independent
MCP checks. Those establish the behavior for these nine inventory criteria:

- VK14: [cancelled-friendship follow-up](vk-cancelled.md), historical prompt
  recognition, optional blocking, fresh evidence and durable non-replay.
- VK15: [friend greetings](vk-greet.md), current friendship, online/history/write
  filters, ordering, cooldown, native stickers and limited delivery.
- VK16–VK18: [independent topic/help/music policies](vk-reengage.md), complete
  dormant history and ordered, acknowledged remaining-only recovery.
- VK19: [community invitations](vk-wall.md), native attachments, optional avatar
  and confirmed publication before owned-post replacement.
- VK21: [birthday greetings](vk-birthday.md), editable variants, local calendar,
  native media and durable per-date deduplication.
- VD04: [desktop friend policy](vk-desktop-policy.md), distinct-request quota,
  mutual-only selection and shared priority protection.
- VD05: [community/avatar/invitation editors](vk-wall.md) and
  [birthday catalog](vk-birthday.md), shared CLI, Lino and localized UI.

Each case retains its original local and provider-evidence limits. Synthetic
provider acknowledgements establish implementation behavior; no authenticated
live delivery is claimed. This receipt completes the hosted verification
previously required by those cases. It does not cover the later VK22 retention
commit, which still requires its own exact-head matrix.

Fifty-seven of 113 inventory rows remain unchecked, including separate VK20
friend invitations and every other original unmet requirement.
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft
and unmerged until the entire issue is implemented and verified.
