# Read actual HH common-chat history

Work for [issue 56](https://github.com/link-foundation/meta-sovereign/issues/56)
in [PR 57](https://github.com/link-foundation/meta-sovereign/pull/57). This is
the modern API history portion of QA02/QA06 and HH09–HH11. Browser messaging,
unread watching, authenticated provider verification and wider parity remain open.

## Reproduction and source

At `e280197a`, the default live reader requests `/negotiations` as though its
items were messages. The current API returns negotiation collections there.
A finite fixture of the documented common-chat API fails immediately on that
request. Connections also has no HH Fetch control. An independent rendering
regression finds that the shared bubble ignores explicit `outgoing: true`
unless the sender is literally `me`; real participant IDs render on the left.

The [official API documentation](https://api.hh.ru/openapi/en/redoc) and its
[OpenAPI specification](https://api.hh.ru/openapi/specification/public/en),
checked on 2026-11-10, define paginated `/common/chats`, oldest-first message
reads with an inclusive message boundary, `has_more`, explicit participant
direction and UUID idempotency keys for text sends. Selected schemas and
examples are preserved in the evidence archive. No reference code is copied.

## Implemented behavior

The default live reader verifies `/me`, enumerates chat pages and reads actual
messages oldest first. IDs include both chat and message IDs, separate from
legacy negotiation IDs. Bodies, attachments, timestamps, edits, raw records,
real sender IDs, explicit direction, service barriers and write restrictions
are retained. Repeated imports remain one observed learning turn; edits retain
immutable versions. Unknown participant direction stays unknown.

Each fetch has a finite request budget: ten chat/message requests by default,
configurable from one to fifty, plus one identity request. Message pages have
two to fifty entries. The saved cursor is bound to the account and API host
and advances only after successful message storage. The inclusive boundary is
reread for edits and counted once. Invalid pages, changed chat identity,
missing IDs and nonprogressing cursors fail before storage or cursor advance.
Changing chat lists and the provider's maximum list window produce explicit
limited coverage. Completion means the available API window was checked;
it does not claim all historical provider data exists in that window.

CLI `source-pull --source=hh --max-requests=2` persists continuation across
real store reopen; `--restart-history` starts again. The store always closes.
Manual Connections Fetch and text/binary Lino pull controls share the same
reader, partial/limited/complete counts and persisted status. HH has no
implicit polling schedule and fetching does not mark messages read. Four
locales explain continuation and coverage. Setup guidance accepts an already
obtained archive containing actual messages, rather than promising an
unverified provider JSON-export command. Legacy archive IDs and the explicit
`negotiations` protocol remain available.

Modern chat replies use the matching common-chat endpoint. A fresh read must
confirm the same chat accepts writing. Text sends include a UUID idempotency
key and require a positive sent-message ID; unknown outcomes forbid automatic
fallback. Attachments and quoted replies are refused before provider reads.
This does not establish full browser messaging or delivery-state parity.

The shared Chat/Operator bubble now uses the same existing ownership predicate
as message selection, preserving real sender IDs while rendering outgoing
messages on the correct side.

## Verification

Focused checks cover API pagination, bounded continuation, account changes,
failed storage, malformed/nonprogressing pages, provider windows, changed
lists, sender direction, edits, learning counts and guarded send receipts.
Controls exercise actual CLI store reopen and real HTTP text/binary Lino.
The final check log records 61 passing Node checks including the CI registry,
locale and rendering checks; twelve focused Deno cases pass. Earlier
compatibility groups pass 66 Node checks; 40
additional bubble/selection/guide checks pass. No full local suite runs.

Reproduce the final focused checks with:

```sh
NODE_OPTIONS=--max-old-space-size=384 node --test --test-concurrency=1 --test-timeout=30000 js/tests/hh-common-chats.test.js js/tests/hh-common-controls.test.js js/tests/provider-bubble-direction.test.js js/tests/connection-guide-i18n.test.js js/tests/i18n.test.js js/tests/ci-contracts.test.js
deno test --allow-all --v8-flags=--max-old-space-size=384 js/tests/hh-common-chats.test.js
NODE_OPTIONS=--max-old-space-size=384 RUN_BROWSER_E2E=1 E2E_EXECUTABLE_PATH=/usr/bin/google-chrome node experiments/issue-56/hh-common-browser.mjs
```

The focused production Chromium flow and existing inbox-pull Chromium flow
pass. The latter now belongs to the mandatory browser registry for both CI
lanes. Independent Playwright MCP confirms partial then complete history,
five messages across two chats, outgoing alignment and a 390-pixel document
without horizontal overflow. Its sole console error is a favicon 404. The
browser and isolated fixture close afterward. All provider data is synthetic;
no authenticated HH account has been exercised.

Before, the shared HH fetch is absent:

![Missing HH fetch](../../screenshots/issue-56-hh-common-before.png)

After, partial coverage remains visibly unfinished until continuation:

![Partial history](../../screenshots/issue-56-hh-common-partial.png)

![Available history checked](../../screenshots/issue-56-hh-common-after.png)

Before and after outgoing alignment:

![Incorrect incoming alignment](../../screenshots/issue-56-hh-common-alignment-before.png)

![Actual outgoing answer](../../screenshots/issue-56-hh-common-chat.png)

![Independent phone verification](../../screenshots/issue-56-hh-common-mcp-mobile.png)

The [evidence archive](data/hh-common-history.tar.gz) and
[verified manifest](data/hh-common-history.tar.sha256.json) retain finite
regressions, checks, primary schema extracts, browser observations and source
hashes. All five workflows pass for the preceding exact head `e280197a`;
the new head still requires its own CI. That passing Pages run updated zero
APT source files because the hosted runner uses an unhandled mirror-list
file; a separate correction is required. Wider HH, QA, VK and device/platform
criteria remain unfinished. PR 57 stays draft and unmerged.

## Read receipts and provider scopes

At `9ee093a7`, marking HH read through the browser fallback could report success
after scrolling without confirming delivery to the provider. The shared
directory also counted cached rows as unread and lacked a provider filter.

The [public read operation](https://api.hh.ru/openapi/en/redoc#tag/Chats/operation/set-last-viewed-message)
acknowledges a specific HH message with HTTP 204. Chat, when read receipts are
enabled, and Operator's Done action submit a saved message from the displayed
thread. The adapter checks the current provider boundary before sending.
History pulls and post-acknowledgement reads store the provider's unread count.
Operator retains work if the count is still positive or cannot be confirmed.
Chat and Operator offer the same provider selection when several are present.

The focused `hh-common-chats`, `message-actions` and `operator` checks cover
the exact boundary, a newer arrival, unknown acknowledgements, and retained
Operator work. The registered `e2e-inbox-pull-browser.mjs` Chromium scenario
reproduces the missing provider selector on the previous bundle and verifies
both selectors, passive viewing, the exact HH receipt, and Telegram isolation.
Independent Playwright MCP verified desktop layout and a 390-pixel viewport.
The provider responses came from a fixture. Authenticated native web
messaging remains open under HH09.

The native read fallback checks only an already-open numeric web conversation.
It verifies the provider pane, chat row and latest visible message before
requesting a scroll. The read result requires a fresh unread count of zero at
that same boundary. If the history advances, the new boundary and count are
stored without claiming the operation completed. Unrecognized or unavailable
views cannot clear cached unread messages. Four native Chromium regressions
reproduce the old optimistic results and pass with the verified fallback.

## Sending from a saved native conversation

Open a saved native HH conversation in Chat, type a plain message and press
Enter. With the previous Chat bundle, the numeric web address was sent to
the negotiation API. With the current bundle, the server verifies a stored
message from the web conversation and routes it to the native HH composer.
The provider pane must still match before it can send. Drafts and answer
buttons retain their existing behavior. Only a new outgoing provider message
with a positive delivery state replaces the pending bubble. If delivery is
uncertain, Chat keeps the message for review and suspends automatic retries.

The registered question-providers browser scenario checks the production Chat
bundle, the saved provider message ID and one native send with zero API writes.
Three additional Chromium cases cover consecutive sends, existing drafts and
choice buttons, and a pending receipt. Independent Playwright MCP observed a
failed send on the old bundle and a single native dispatch and confirmed Chat
bubble on the current one. The fixture replaces live provider traffic.

![Previous Chat send failure](../../screenshots/issue-56-hh-native-send-before.png)

![Current Chat send confirmed](../../screenshots/issue-56-hh-native-send-after.png)

## Replying in a common chat

In a common chat, open the menu for a saved incoming message, choose Reply,
and send text. Chat keeps the complete saved reference, and the server
verifies that it belongs to the same HeadHunter chat. A fresh provider read
must report that the exact message accepts replies. The [common-chat send
operation](https://api.hh.ru/openapi/en/redoc#tag/Chats/operation/chat-message-post)
receives the opaque parent ID and returns HTTP 201 and the new message ID.
The immediate bubble and later imported history share that ID. Whole-message
Reply appears only where the provider reports support.

The focused `hh-common-chats` checks reproduce the missing receipt link and
reply support on the previous source. They also cover a changed permission,
owner cancellation after the provider check, and a reply to a valid opaque
ID containing a colon. The registered `inbox-pull` Chromium scenario checks
reply selection, provider receipt, saved identity and the visible quote.
Independent Playwright MCP compares the saved reply from both bundles and
observed one fixture POST carrying the complete parent ID.

![Previous common-chat reply failure](../../screenshots/issue-56-hh-common-reply-before.png)

![Common-chat reply with its parent](../../screenshots/issue-56-hh-common-reply-after.png)
