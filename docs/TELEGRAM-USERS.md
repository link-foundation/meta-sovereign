# Telegram users and reviewed contact import

Open a Telegram user-account chat in Chat or Operator, then choose **Export →
Users and contacts**. This uses the connected account's actual access. A
participant list that requires administrator rights remains unavailable in the
report; accessible message history can still contribute identities. A finished
scan does not imply complete membership. Coverage reports show limits,
disabled history and provider refusals separately.

The scan merges unique users from visible participants, message authors,
membership service events, forwards, ID/username mentions and shared contacts.
Each entry keeps its sources and up to eight supporting message IDs. Channel
and group IDs are excluded. Unresolved identities remain visible but cannot be
added. Profiles include available names, usernames, phone numbers and eligibility
flags; access hashes and credentials are excluded from reports.

## Preview and apply

Scanning and previewing do not add contacts. The preview excludes self, bots,
deleted, fake, scam, support and unresolved users, plus existing contacts unless
explicitly included. Review the selected count, exclusions and coverage before
pressing **Add contacts**. The UI initially selects at most 20 eligible people.
The CLI/API default contact limit is zero, meaning all eligible people.

Phone sharing is off by default. Additions use an empty phone field and do not
need the recipient's phone number. **Share my phone number** separately enables
Telegram's phone privacy exception for the reviewed selection. Editing an
option clears the displayed preview. Every plan binds the account, completed
scan, exact people and options, expires after five minutes and applies once.
Account changes, expired plans and changed eligibility prevent stale writes.

Contacts are processed sequentially with a configurable pause, initially ten
seconds. A Telegram flood refusal permits one retry after the requested pause
plus one second, up to an hour. Repeated flood refusals, three consecutive
failures or an uncertain write stop the batch. Cancellation interrupts pauses,
waits for an active provider response and prevents the next addition.

An addition requires a Telegram Updates receipt. A lost response or missing
receipt is **unknown**, even if Telegram may have applied it. Durable per-account
intent and outbox records prevent a new preview, privacy change or account
restart from automatically repeating that operation. Review the provider state
and use the existing explicit outbox resolution controls before another
attempt. Successful and definite failed operations can be explicitly planned
again after a fresh eligibility check.

## CLI

```sh
meta-sovereign telegram-users --chat=@example --participants-limit=10000 --messages-limit=100000
meta-sovereign telegram-chat-contacts --chat=-1001234567890 --limit=20
meta-sovereign telegram-chat-contacts --chat=-1001234567890 --limit=20 --delay-ms=10000 --apply=true
```

The last command explicitly applies its generated selection. Add
`--share-phone=true` only when that privacy exception is intended;
`--include-existing=true` allows already-saved contacts. Exact numeric IDs,
usernames and public `t.me` links are accepted; ambiguous display names are not.
`--store=<dir>` selects the account store. Invalid controls fail before opening
the store or contacting Telegram.

Participant limit zero means unlimited; message limit zero disables history.
The unique-user capacity is 100,000; exceeding it fails explicitly rather than
silently claiming completeness. Participant/message options are capped at
1,000,000/10,000,000. Contact limits are at most 100,000 and delays at most one
hour. JSON output includes every paged user or contact result. Ctrl+C cancels
and waits for account shutdown before closing the store. `--debug=true` enables
metadata-only scan progress diagnostics; it is off by default.

## API and retained results

Use the default Lino transport with these POST routes under `/api/telegram/`:

| Route                         | Request fields                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `chat-users-start`            | `chat`, optional `participantsLimit`, `messagesLimit`, `debug`                       |
| `chat-users-status`           | Optional `offset` and `limit` (1–500)                                                |
| `chat-users-cancel`           | Empty object                                                                         |
| `chat-users-contacts-preview` | Completed scan `jobId`, optional `limit`, `delayMs`, `sharePhone`, `includeExisting` |
| `chat-users-contacts-apply`   | `planId`, `confirm: true`                                                            |

The account methods have the corresponding camel-case names. Status returns
`job`, `users`, `results`, `offset` and `more`. Preview returns selected/eligible
counts, exclusions, coverage, expiry and at most 100 sample profiles. Apply uses
the frozen plan rather than replacement options in the request. Only one job
runs per account. The browser requires the actual `chatUsersStart` user-account
capability and downloads the complete report across status pages.

Job summaries, collected users and individual contact outcomes are stored as
normal Links records. Closing and reopening the dialog preserves the running
account job. Restarting the account does not automatically resume a scan or
contact batch; a new scan and preview are required. Unknown-write protection
survives that restart. No live Telegram credentials are needed for the isolated
regression fixtures; live permissions still determine actual coverage.

See the [implementation and evidence](case-studies/issue-56/telegram-users.md).
