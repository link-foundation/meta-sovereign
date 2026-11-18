# Native context before the first live trigger

The pinned `konard/vk-bot` runner at
`175d2d13218d9e791ae2f3e824a0d24f10319dcb` loads a peer's newest 100 messages
before evaluating its first incoming trigger. The existing periodic backfill
only visits three recent conversations per pull and does not establish this
ordering for another peer's live event. On published parent
`aee0a2ec0c2445a0a39c61ac6c4c6cf91f5129f3`, the regression's real scheduler
observes one message instead of 100. Reproduce that actual-parent assertion with
`python3 -B experiments/issue-56/vk-live-history-before.py`.

Long Poll now reads a native 100-message history window before storing the first
live batch for each peer. It reuses the cache provider's strict page validation,
checks the requested window's exact bounded size and carries names, attachments
and native direction through the existing message converter. A response missing
redundant peer IDs inherits only the requested peer; contradictory IDs fail.
Existing messages retain live edits, while pending native events are stored last.

Fetched historical mutations remain visible to storage/UI subscribers but do not
invoke incoming automation. Their symbol metadata is transient, forwarded through
bulk/single writes and causal/version wrappers, and absent from stored records.
The subsequent live event reaches the real scheduler with its context available.
The store retains history normally; the per-client recent-peer working set is
bounded to 256 entries and safely reloads evicted peers. A new client session
refreshes its context instead of trusting an old marker as current evidence.

A durable marker reports native loaded/total counts, window size, time and exact
partial/complete coverage. Refused, malformed, short or unacknowledged windows do
not admit the current event, advance its cursor or cache success. Retrying a
failed write reads again. Credential replacement during a held read refuses that
old client's event; the next client verifies identity, obtains a fresh Long Poll
session and resets incompatible account cursors/backfill. Shutdown drains a
history request already admitted before the final flush. Optional count-only
history diagnostics default off and exclude message text and credentials.

Seven new cases and relevant inbox, attachment, automation and trigger tests total
79 passing Node and Deno checks. They include real incoming-trigger ordering,
historical suppression, two peers/reopen/edits, malformed and short pages, failed
acknowledgement recovery, durable binary reopen, transient subscription metadata,
single-write fallback, credential replacement and held-read shutdown. The existing
metadata-failure fixture now refuses the metadata acknowledgement specifically,
after the first context acknowledgement, preserving its landed-message assertions.
The initial five compatibility fixture failures are retained alongside the
corrected fixtures. Fixture requests never contact live VK.

There is no new UI surface in this ordering correction. Existing queue, trigger,
collection and inbox controls remain the public interfaces. Strict lint, format,
secret and unchanged duplication checks pass. The [checked archive](data/vk-live-history.tar.gz)
and [manifest](data/vk-live-history.tar.sha256.json) retain source/parent bytes,
pinned runner/schema references, initial diagnostics and focused results.

Exact-head hosted acceptance remains required before VK26 is accepted. All other
unchecked original criteria remain active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), which stays
draft and unmerged.
