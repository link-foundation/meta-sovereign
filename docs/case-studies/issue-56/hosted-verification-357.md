# Hosted verification on 35764037

All five workflows completed successfully on exact published head
`35764037b1fba1fbbd613e46d366359a5c1f0959`, created at
2026-11-15 14:36:58 UTC. All 75 jobs succeeded or intentionally skipped.
No cancelled or unfinished job is counted as acceptance.

| Workflow                 | Exact run                                                                                 | Jobs |
| ------------------------ | ----------------------------------------------------------------------------------------- | ---- |
| Checks and release       | [43725324003](https://github.com/link-foundation/meta-sovereign/actions/runs/43725324003) | 57   |
| Desktop release          | [43725323886](https://github.com/link-foundation/meta-sovereign/actions/runs/43725323886) | 7    |
| Deploy to GitHub Pages   | [43725323926](https://github.com/link-foundation/meta-sovereign/actions/runs/43725323926) | 4    |
| Scheduled security audit | [43725323964](https://github.com/link-foundation/meta-sovereign/actions/runs/43725323964) | 6    |
| Broken Link Checker      | [43725323871](https://github.com/link-foundation/meta-sovereign/actions/runs/43725323871) | 1    |

The checked [metadata archive](data/hosted-verification-357.tar.gz) and
[manifest](data/hosted-verification-357.tar.sha256.json) retain exact SHA,
timestamps, job IDs and conclusions. The existing collector requires five
successful workflows and rejects failed or unfinished jobs. Full runtime,
platform and browser matrices ran in hosted CI.

Acceptance also requires the preserved complete pinned source audits,
actual-parent reproductions, focused Node/Deno checks, native browser and
independent MCP evidence:

- VK20: the [friend invitation source audit](vk-friend-invitations.md) and
  [community wall parity](vk-wall-parity.md) cover configured community
  campaigns, frozen optional single-media choice, restricted variants,
  any-author visible-invitation holds and positively confirmed old-post absence.
  Durable partial recovery retains the new receipt and never republishes.
- VK22: [history retention](vk-retention.md) covers strict thresholds, complete
  bounded review, definitive unsupported-method fallback, positive per-message
  acknowledgements, remaining-only recovery and recoverable local tombstones
  after provider readback. Unknown outcomes never authorize replay or clearing.

These two criteria are complete. The discovery implementation is covered by
this matrix, but VK23 remains unchecked pending its complete outgoing-message
mapping with VK26. The later VK24 cache/export commit requires its own exact-head
hosted checks. Synthetic acknowledgements establish implementation behavior;
no authenticated live provider operation is claimed.

Fifty-five of 113 inventory rows remain unchecked. Every remaining original
requirement stays required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57),
which remains draft and unmerged until the entire issue is verified.
