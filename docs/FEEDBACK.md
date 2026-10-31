# Feedback on my messages

Feedback ranks the account owner's saved messages by received reactions. The
default covers only our own messages; provider, date, shared-conversation and
recency filters narrow that selection. Counts and known authors are separate:
one person can have several reaction observations, and anonymous totals need
not have matching identities. Pages show 25 messages and 50 observations.

Open an original message to load its surrounding history and highlight it in
the shared Chat stream. Author lists show saved observations immediately and
fetch one available provider page on opening. Identified people have a profile
with source-backed reaction evidence and a private-chat action where the
adapter has a real address. That action opens a conversation; it sends nothing.
Display names alone are not stable IDs. Numeric IDs are labeled in profiles.

Reaction evidence records an observed action, not agreement, friendship or a
person's beliefs. Removed reactions remain historical observations; current
counts can be lower than the retained evidence. Known identities are preserved
when later provider responses contain only counts. Evidence records survive
restarts and do not depend on keeping the browser open. The server must remain
running to receive new data. Unobserved events that a provider no longer
supplies cannot be reconstructed.

## Collection and resource bounds

Background author collection and profile evidence default on, with persistent
account-specific switches in Settings. Disabling collection stops subsequent
background work without deleting saved evidence. Explicit author lookup remains
available. Conversation-learning opt-outs also hide profile evidence.

The collector uses the existing provider queue at prefetch priority. It requests
one author page per account every 30 seconds, resumes saved cursors, backs off
after refusals, and coalesces concurrent requests. It never crawls unrelated
websites. Coverage follows the conversations discovered by existing sync and
history collection. It cannot discover every public message on the internet.

Feedback extends the existing chat-index scan with sparse metadata for our own
messages with reactions. It keeps no second full message archive or decoded raw
payload cache. Profile lookups use a person-to-message index. Only the requested
page is hydrated. Author records are excluded from the chat directory and its
live feed; they are fetched separately in bounded pages. Evidence writes are
serialized, coalesced and retained for retry after a write failure. Diagnostics
record counts, durations and provider refusal codes without message content.

## Provider capability contract

All adapters may provide normalized `reactions: [{emoji, count, by}]`. An author
can supply an ID, kind, name and username; count-only observations are valid.
Only explicit `sender: me` or `outgoing: true` establishes our authorship.
Unknown ownership is not guessed. Telegram raw reaction summaries are projected
while packing so indexing does not inflate provider payloads.

| Provider                                                                      | Implemented Feedback input and lookup                                                                    | Remaining adapter work                                                                |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Telegram                                                                      | Saved counts/recent authors; live author pagination for eligible messages; durable profiles and evidence | Continue existing sync/backfill for additional conversations                          |
| VK                                                                            | Saved normalized counts and identified authors                                                           | Live message/post author pagination                                                   |
| X                                                                             | Imported reaction counts and author IDs where exported                                                   | Live post/like/repost author pagination with API access                               |
| Facebook / Messenger                                                          | Imported reaction counts and names where present                                                         | Stable identity resolution and permitted live pagination                              |
| LinkedIn                                                                      | Normalized observations when supplied                                                                    | Permitted live reactions and author identity lookup                                   |
| WhatsApp                                                                      | Normalized observations when supplied                                                                    | Connect live reaction webhook sender/removal events to this contract                  |
| GitHub                                                                        | Normalized observations when supplied                                                                    | Map issue/comment/discussion reactions and REST pagination                            |
| Email                                                                         | No standard reaction-author API                                                                          | Provider-specific reaction conventions with explicit provenance                       |
| Habr Career, hh, SuperJob, Upwork, PeoplePerHour, Naukri, VietnamWorks, TopCV | Contract available; no reaction lookup claimed                                                           | Implement only feedback actually exposed by each service; preserve unsupported states |

Telegram explicitly prevents reaction-author enumeration for broadcast channels
(`BROADCAST_FORBIDDEN`). Anonymous totals remain useful; hidden people are never
invented or deanonymized. See the official [reactions API](https://core.telegram.org/api/reactions)
and [author-list method](https://core.telegram.org/method/messages.getMessageReactionsList).
GitHub's [reaction endpoints](https://docs.github.com/en/rest/reactions/reactions?apiVersion=2022-11-28)
are an adapter reference, not a claim that live GitHub collection is implemented.

Visual surfaces follow the shared T3-inspired controls and Telegram-inspired
message targeting documented in [Chat References](CHAT-REFERENCES.md).
