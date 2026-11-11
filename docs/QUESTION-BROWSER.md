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

Validation uses synthetic routed provider pages and the production sender. Live
signed-in provider verification, completed-bot summary recovery and automatic
provider watchers remain separate, unfinished issue #56 criteria.
