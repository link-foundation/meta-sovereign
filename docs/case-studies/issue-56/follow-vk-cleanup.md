# VK Follow incoming-cleanup boundary

Work for [issue 56](https://github.com/link-foundation/meta-sovereign/issues/56)
in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57).
This corrects the VK cleanup adapter. FL08 preview cancellation and the remaining
issue-wide work remain unfinished; PR stays draft and unmerged.

## Reproduction and cause

After a backlink survives its configured monitoring window, let the initial
history scan nominate incoming message IDs. Return an outgoing, service,
deleted, unavailable, missing, duplicate or different-chat message when those
IDs are reread. Previously the adapter accepted IDs without rereading them and
issued deletion. It also discarded the caller's `cancelled` and `read` controls,
so cancellation while waiting for the VK limiter could still issue the write.

Five focused regressions fail against preceding `a72a0551`: changed message
validation, canonical distinct IDs, fresh bound identity, actual issue-boundary
cancellation and configured cleanup-read retry. Existing shutdown receipt
ownership already passes and is retained. The complete before log is preserved.

## Correction

Validate 1–200 distinct canonical string IDs before any provider read. Reread
exact IDs and require every row to belong to the reviewed chat, remain incoming
and contain no service/deleted/unavailable state. Recheck the adapter's bound
user after that read. Use the caller's finite timeout-only policy for these
reads and pass cancellation through the VK transport's guard after its limiter.

Deletion remains local-only (`delete_for_all: 0`) and issues once. Only explicit
per-ID acknowledgements enter the local tombstone projection. A lost delete
response remains unknown, retains its durable intent and is not repeated by a
new controller. Shutdown still waits for an issued delete and retains its
positive per-ID receipt even when cancellation arrived during the request.

## Verification

```sh
node --test --test-concurrency=1 js/tests/follow-vk-cleanup.test.js js/tests/follow-backlinks.test.js js/tests/follow-telegram-backlinks.test.js js/tests/follow-telegram-backlink-lifecycle.test.js js/tests/follow-auto.test.js js/tests/follow-auto-lifecycle.test.js js/tests/follow-auto-persistence.test.js
node --test --test-concurrency=1 js/tests/follow-backlink-controls.test.js js/tests/follow-telegram-backlink-controls.test.js js/tests/follow-retry.test.js
```

The groups pass 66 and 13 checks respectively, sequentially. Six cleanup cases
use the production VK HTTP transport. The timeout case observes three reads
with 10/20 ms backoff and exactly one uncertain delete, then reopens the
controller and confirms no replay. The limiter case cancels at the actual
write boundary. Existing partial-acknowledgement, tombstone, durable-store,
Telegram and all automatic-provider-pair regressions pass.

The existing CI-registered production Chromium backlink flow passes review,
confirmed incoming-only cleanup, deduplication, timeout recovery, retained
receipts and mobile width. UI output and assets do not change in this correction;
its visual evidence remains in [follow-backlinks.md](follow-backlinks.md).
Scoped strict lint, formatting, secret scanning and diff whitespace checks pass.
No live provider account actions are performed.

Exact preceding-head CI snapshots, complete reproduction/verification logs and
source hashes are in [follow-vk-cleanup.tar.gz](data/follow-vk-cleanup.tar.gz),
with a [SHA-256 manifest](data/follow-vk-cleanup.tar.sha256.json). New-head CI
remains required. Follow's remaining preview cancellation audit and every other
unchecked issue criterion remain required.
