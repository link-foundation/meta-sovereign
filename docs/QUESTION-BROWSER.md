# Reviewed browser answers

In Automation → Questions and saved answers, open **Provider browser answers**.
The same controls appear in Chat and Operator's automation menu. Choose a
supported provider and an explicit web-chat reference, then read the current
question. For HH, use a numeric web-chat ID or its official chat URL; an API UUID
is not a web-chat ID. An optional official application URL selects its visible
embedded conversation.

Review the question, saved-answer evidence and exact offered labels. Selecting
**Send “…” in the provider chat** confirms that particular native option. A changed
question, unavailable controls or an existing owner draft prevents the click.
Generic conversation starters are not answer choices. For a free-text question,
**Prefill the reviewed draft** fills an empty provider input and verifies its value;
you review and send it in that provider. Prefilling never submits a message.

The server privately saves a review for 30 minutes. A durable question reservation
is shared with automatic answers. A positive outgoing provider message receipt
establishes delivery. **Recover selection status** reads saved state without
opening a browser or repeating a click. A lost response keeps selection blocked
until status recovers. An unknown receipt stays protected across reload/restart;
check the provider and resolve the entry in Outbox. Unsupported/offline adapters
cannot report successful delivery. Capability discovery itself opens no browser.

```sh
meta-sovereign automations answers browser show
meta-sovereign automations answers browser inspect --source=hh --chat=7
meta-sovereign automations answers browser select --id=<review-id> --option=Yes --confirm=true
meta-sovereign automations answers browser status --id=<review-id>
meta-sovereign automations answers browser prefill --id=<free-text-review-id>
```

The trusted server exposes `GET /api/automations/answers/browser` and
`POST /api/automations/answers/browser/{inspect,prefill,select,status}` through
negotiated text/binary Links Notation. Inspection accepts the existing profile,
salary, context and optional model planning settings. Selection requires the
saved review ID, exact option and boolean `confirm: true`.

A unique completed incoming answer summary can recover one exact current option
for the same question across stored chats. Conflicting answers, incomplete scans,
owner messages, rejected answers and explicit corrections keep the result for
review. Summary evidence neither approves a saved rule nor increases its observed
answer count; it cannot authorize a free-text answer, form field or salary target.
Existing approved exact options retain priority. The summary is checked again
before automatic delivery, and the shared UI shows its source messages.

For a local CLI preview, pass offered labels as Links Notation:
`meta-sovereign automations answers plan --question="Do you have distributed systems experience?" --options='(Yes No)' --strict-options=true`.
The existing answer-plan API accepts `options` and boolean `strictOptions` too.

After reading the current HH question, **Watch this chat and answer known choices**
starts explicit automation for 1–120 minutes (120 by default). It clicks only
approved exact options or a unique accepted-summary option, rechecking the saved
knowledge before each action. Disabled or delayed choices wait. Free-text answers
are prefilled for your review and never sent automatically. An unchanged automatic
draft clears when native choices appear; your edits are preserved. The watch stays
with the original document: navigation, reload, ambiguous delivery or loss of its
owner pauses it. **Stop watcher and wait** drains the current action before closing.

```sh
meta-sovereign automations answers browser watch --id=<review-id> --confirm=true --duration-ms=7200000
meta-sovereign automations answers browser watch-status --watch-id=<watch-id>
```

The CLI watch owns the foreground process; Ctrl+C or SIGTERM stops and drains it.
A separate CLI process can read the saved record but cannot control or resume that
foreground owner. The owning server exposes trusted
`POST /api/automations/answers/browser/{watch-start,watch-status,watch-stop}` in
text/binary Lino. Start requires `{id: 'question-watch:<uuid>', review: '<review-id>',
confirm: true, durationMs: 7200000}`. Repeated start IDs recover existing state
without opening or resuming a watcher. Keep that ID if a response is lost; UI
reload only reads its status. Saved active records without a running owner show
paused/owner-unavailable. A new watch requires a fresh explicit start.

Validation uses synthetic routed provider pages and the production sender. Live
signed-in provider parity and all-unread chat orchestration remain unfinished
issue #56 criteria. See [current-chat evidence](case-studies/issue-56/question-watch.md).

Explicit unread passes now save each verified history window to the selected
server's normal message archive before scrolling away. Repeated native IDs update
the same message; observed edits retain message versions. A failed save stops the
pass and attempts to restore the owned view. Stop waits for an admitted save.
Status recovery never repeats the traversal. Partial coverage stays partial;
unseen messages and missing timestamps are not reconstructed. Existing explicit
answer learning can use the saved turns, with private link targets excluded and
all new answers unapproved. See [history evidence](case-studies/issue-56/browser-history-archive.md).

HH browser reads preserve native pending, failed, sent, delivered and read states. Missing, unfamiliar or conflicting outgoing status icons remain unknown; uncertain bubbles cannot confirm a send or become learned answers. Migration 0021 marks older browser replies without status evidence unknown until reread. Existing saved answers remain owner data. [Delivery verification](case-studies/issue-56/hh-browser-delivery.md).

A confirmed current-chat watch also snapshots mounted message changes as the DOM
observer sees them, before the next polling read. Acknowledged archive writes run
in order; observed text versions and delivery changes survive later removal from
the pane. Reused message IDs or changed previously observed HH header facts refuse
attribution. A failed save or a backlog over 64 snapshots or 2 MiB pauses the
watch; Stop disconnects capture and waits for admitted writes, reporting any gap.
Status recovery does not restart capture. This covers the confirmed document,
not other chats or every intermediate synchronous DOM state. Authenticated
provider parity and all-unread orchestration remain unfinished.
[Live capture evidence](case-studies/issue-56/hh-live-capture.md).
