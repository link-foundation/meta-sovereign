# Persist explicitly reviewed provider text replies

Implementation evidence for [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57), R-AA1. This backend unit adds the shared service, CLI, default text/binary Lino route and checked browser client. Visible shared text controls, background acknowledgement/rejection delivery, inactive-owner restoration, unread orchestration and every unchecked issue criterion remain required. The PR stays draft and unmerged.

## Reproduction and behavior

Actual parent `9ca1c99789f0224497a159408e501266b2eba556` has a guarded native text primitive but no persistent reviewed-text service or route. The new admission check fails on that parent: browser capabilities have no `textSources`. Run the retained parent probe to temporarily restore the parent service and restore the working file in `finally`:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/question-text-before.py
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=20000 js/tests/question-browser-text.test.js js/tests/question-browser-text-controls.test.js
```

Capability discovery now reports only providers with verified native text support, without opening a browser. HH currently qualifies. Inspect the current chat through `answers browser inspect --source=hh --chat=7`, then explicitly approve its frozen review:

```sh
meta-sovereign answers browser reply-text --id=<review-id> --text="Reviewed reply" --confirm=true
meta-sovereign answers browser status --id=<review-id>
```

The matching `POST /api/automations/answers/browser/reply-text` accepts `{id, text, confirm: true}` through the existing trusted-origin text/binary Lino transport. String `"true"` is not API confirmation. The browser client exposes `replyBrowserText` as one mutation call; recovering status is a read and never replays a send. The CLI accepts its existing explicit `--confirm=true` representation.

The service requires an unexpired incoming free-text review with coherent bounded pending context, an empty composer and a nonempty reply of at most 12,000 characters. Unsupported sources, native-option prompts, missing context, owner drafts and a prefilled composer refuse before reservation. Existing provider guards revalidate the entire frozen turn and native controls around dispatch. Plain HH text sends remain unavailable.

Text and native choices reserve the same provider/chat/question key before dispatch, followed by a durable flush. Different reviews, reply bodies, changed choice controls and process restarts cannot bypass a sending, sent or uncertain reservation. The outbox retains the entire bounded submitted text and a matching provider receipt; its ordinary 2,000-character preview limit still applies to other sends. A missing/mismatched receipt remains uncertain. Failed persistence before dispatch sends nothing; failed persistence afterward retains the blocking reservation. Only explicit outbox resolution can settle uncertainty. Closing the service refuses new work and drains admitted actions.

## Focused evidence

Thirteen new Node checks pass, including CLI, both Lino transports, strict confirmation, unsupported capability, frozen-turn/draft/expiry refusals, full 12,000-character text, altered-tail receipts, duplicate reviews, choice/text reservation sharing, opt-outs, failed writes/flushes, concurrency, shutdown and actual Lino-store reopen. Forty-five existing choice, watcher, native-text, outbox and notice checks pass, including all assertions retained through shared CLI/HTTP fixture extraction.

Five isolated production Chromium cases pass through the real server, default sender, browser-commander and HH-shaped native controls:

- Text and binary Lino each dispatch one native text reply with a fresh outgoing receipt and no choice click; status and duplicate requests add no effects.
- A missing receipt retains the uncertain draft and blocks a second send.
- An owner draft survives with zero sends.
- Editing an earlier pending question refuses the stale reply before typing or dispatch.

```sh
NODE_OPTIONS=--max-old-space-size=384 node experiments/issue-56/question-text-browser.mjs
```

The first browser probe mounted synthetic history before the sender's initial navigation, which replaced that fixture DOM. Its retained log reports one pending message instead of two. The corrected probe first establishes the owned document, then mounts pending history; production code is unchanged for this correction. All fixtures close their browsers, servers and temporary stores. No live account or full local matrix runs.

Scoped lint, formatting, secret scanning and the unchanged duplication gate pass (6.50%, below the configured threshold in the unrounded result). Shared CLI/HTTP setup now serves the native-choice, watcher and text checks without removing assertions. The [evidence archive](data/question-text.tar.gz) and SHA-256 manifest retain current/parent source snapshots and raw logs, collected by [collect-question-text.py](../../../experiments/issue-56/collect-question-text.py). Exact-head hosted verification remains required; the preceding commit passes completed runtime/native/security checks while its two browser lanes are still running at this observation. Visible controls and independent visual/MCP verification follow in the next unit.
