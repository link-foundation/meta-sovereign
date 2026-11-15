# VK friendship follow-up

Connections → VK → Enter manually contains **VK friendship follow-up**.
It is separate from friend acceptance, inactive-friend cleanup and outgoing
request cancellation. Automatic runs and both blocking choices start off.
Save the greeting and question, prepare a review, inspect every proposed
message or block, then explicitly confirm that review. Greeting and question
are one message; a positive native message receipt also appears in Chat.

VK outgoing requests identify candidates, including requests that were never
accepted. They do **not** prove that somebody cancelled a friendship. The
review states this limit and uses a neutral default question. It checks a
personal conversation, write permission, current account and relationship,
and complete history of up to 1,000 messages. Missing, inconsistent, larger or
future-dated history refuses action. The candidate limit is 0–100; zero
disables actions. It limits the outgoing requests inspected, including those
already prompted or protected, rather than substituting other people.

An acknowledged prompt is remembered per sending account/person across
restarts and text changes. Existing outgoing messages ending with the saved
question or the pinned reference's Russian friendship question also prevent
repeat prompts; incoming lookalikes do not. A lost response remains unknown
and is never retried automatically. There is no reset or replay button.

Blocking has two independent, initially disabled choices:

- **Unanswered interval:** allow a block only after the configured 1–365 days
  have elapsed since the latest outgoing message, with a recognized earlier
  question and no subsequent incoming or service message.
- **Writing unavailable:** allow a block when VK explicitly reports that the
  current personal conversation cannot receive messages.

Priority IDs saved in any friend policy and the shared messaging opt-out list
are protected. Automatic runs obey quiet hours. Reviews expire after five
minutes; changes to account, credentials, policy, priorities, consent,
relationship, permission or history require a fresh review. The service saves
an acknowledged intent after provider pacing and rechecks state before issue.
Only a positive message ID or an exact successful block receipt is confirmed.
The independent server-owned schedule uses the saved 1–1,440 minute interval,
with 15 seconds between candidate actions, and drains on shutdown.

```sh
meta-sovereign vk-cancelled status
meta-sovereign vk-cancelled save --enabled=false --limit=20 --every-minutes=20 --wait-days=2 --greeting='Hello!' --question='Would you like to stay in touch?' --block-unanswered=false --block-unwritable=false
meta-sovereign vk-cancelled plan
meta-sovereign vk-cancelled run --plan=PLAN_ID --confirm=true
```

Foreground commands close their owned store/job and do not start a scheduler.
The default text and binary Lino API uses `GET/POST /api/vk/cancelled`,
`POST /api/vk/cancelled/plan`, and `POST /api/vk/cancelled/run` with the reviewed
`planId` and `confirm: true`. Browser-origin and current-review checks apply.
Offline controls can save settings and display retained evidence, but require
a connected server for provider actions. English, Russian, Hindi and Chinese
share the same controls and delivery states.

[Verification and pinned-source comparison](case-studies/issue-56/vk-cancelled.md).
