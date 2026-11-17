# Independent VK controls: complete VD03 review

VD03 is verified at `20e603f18ef624160c339f8ce2604e5b11ca120e`.
The inventory now contains **83 verified criteria and 35 unfinished criteria**.
Every unfinished requirement remains required in the draft, unmerged
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Complete pinned contract

The pinned desktop [Bot Behavior 16](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/docs/REQUIREMENTS.md#L58)
requires every behavior to be independently toggleable. The complete
[configuration](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/src/bot/config.js#L30)
has these six switches. Both pinned files were read in full; their Git blob
identities are retained with their decoded contents in the evidence archive.

| Pinned feature                 | Shared job and saved configuration suffix | Independent positive check in hosted Node log |
| ------------------------------ | ----------------------------------------- | --------------------------------------------- |
| `onlineStatus`                 | `online`                                  | 7889                                          |
| `acceptFriendRequests`         | `friends`                                 | 7890                                          |
| `deleteDeactivatedFriends`     | `cleanup`                                 | 7891                                          |
| `deleteOutgoingFriendRequests` | `outgoing`                                | 7892                                          |
| `sendInvitationPosts`          | `wall`                                    | 7893                                          |
| `sendBirthdayCongratulations`  | `birthday`                                | 7894                                          |

Each suffix owns `provider-job:vk:<suffix>` and its own state; planning jobs
also own their plan record. The settings factories and job admission code were
reviewed against the current archived source. Sharing the serialized store and
provider pacing does not require another job's enabled flag. Each scheduled job
reads its own saved enabled flag, interval and last attempt before admission.
The server starts owned timers after acquiring its port and drains every job
on Stop/shutdown. CLI delegation selects the requested job; the corresponding
default-Lino routes and Connections controls load and acknowledge that same
independent policy.

The six disk-store regression bodies and their shared fixture were read in
full. Each enables exactly one actual job, reopens its Lino file, polls all six
actual jobs with bounded fake network responses and requires a positive receipt
only for the selected job. The other five preserve their policies and make no
provider calls. Disable, a two-day clock advance and another reopen preserve
the receipt while preventing further calls. Every owned timer is drained.
This verifies independence through actual scheduling admission and persistence.

All six policies deliberately start disabled for owner consent. Invitations
require configured destinations. This acceptance covers independent controls;
the remaining desktop execution/configuration and job business requirements
retain their separate inventory rows and complete scope.

## Exact-source hosted evidence

All five workflows started at 2026-11-17 16:58:39 UTC with the revision above.
They finish successfully, with 72 successful jobs and six intentional
release/deployment skips:

| Workflow           | Result                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Checks and release | [Success, attempt 3](https://github.com/link-foundation/meta-sovereign/actions/runs/44131832553/attempts/3) |
| Desktop            | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44131832539)                       |
| Pages              | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44131832474)                       |
| Links              | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44131832604)                       |
| Security           | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44131832527)                       |

Four macOS jobs in attempt 1 never acquired a hosted runner. Three Deno jobs
passed on retry; Bun again failed to acquire a runner in attempt 2, then passed
in attempt 3 (18:37:06–18:40:52 UTC). The annotations identify runner acquisition,
with empty initial step lists and unavailable initial logs. The final Bun
job's complete successful steps, failed attempt-2 log and original annotations
are archived. No assertion, deadline or implementation was changed for retry.

The collector binds 92 uniquely named existing portable policy checks and the
six independence checks to actual passing lines in the source's Node log. It
also binds the mandatory `vk-independent` registration to Chromium and WebKit
shard 2. Both actual browser receipts have exactly six independent policies,
twelve acknowledged toggles, six reloads and retained fields, with the scheduler
inactive, zero provider effects and zero page exceptions. The raw receipts are
at Chromium log line 2991 and WebKit line 2797; each is followed by its engine's
successful scenario result. These controls use real routes and saved policies.
They do not claim authenticated provider operations or a clean browser console.

Nine underlying evidence archives verify 1,057 entries. The source audit retains
historical production differences; those hashes establish provenance, while
the manual review above and current-source semantic checks establish this
criterion's behavior. Other policy tests support regression coverage without
accepting their broader business criteria. Local Chromium and independent MCP
receipts, screenshots, initial failed assertions and the bounded source review
are described in [the implementation report](vk-independent-jobs.md).

## Reproduction and acceptance decision

Run only the six focused portable cases locally; CI owns the complete matrices:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/vk-independent-jobs.test.js
RUN_BROWSER_E2E=1 npm run test:e2e:vk-independent
```

The [hosted archive](data/vk-independent-hosted-20e603f1.tar.gz) and
[per-file manifest](data/vk-independent-hosted-20e603f1.tar.sha256.json) preserve
the five workflow records, selected complete job logs, exact source, pinned
contracts, source audit and collector. The initial reference-envelope mismatch
is preserved; supplying authenticated Contents API metadata for the same pinned
Git blobs corrected collection without weakening a check.

The collector intentionally leaves `acceptance: false`: automated evidence
collection cannot make a manual criterion decision. This report records the
separate complete VD03 mapping and accepts only VD03. New feature commits after
the reviewed revision still require their own exact-head hosted verification.
