# X feature matrix (languages: en • [zh](x.zh.md) • [hi](x.hi.md) • [ru](x.ru.md))

Back to the [Telegram feature matrix](../FEATURES.md). This page covers X only.

## Scope and access

For a personal account there are three routes:

1. **Official API v2** (`https://api.x.com`). Docs: https://docs.x.com/x-api/getting-started/pricing and https://developer.x.com/en/docs/authentication/oauth-2-0. Access is pay-per-use credits with no subscription (per the pricing page: DM event read about $0.010 per resource, DM create about $0.015 per request, post read $0.005, post create $0.015, or $0.20 with a URL). The pricing page does not say which plan unlocks DMs, and the DM endpoint reference could not be fetched, so DM eligibility must be confirmed in the X Developer Console. DM endpoints need a user-context token with `dm.read` / `dm.write` scopes (general knowledge, not verified here). The app takes one pasted bearer token (`secret:x:token` or env `X_ACCESS_TOKEN`); there is no OAuth flow, no refresh and no scope check.
2. **Web app in a browser** (x.com/messages) through the app's browser automation: send, read chat list and history, delete, react. The selectors are best-effort and unverified against a live account. X has no edit or forward for DMs.
3. **Archive import** (Settings > Download your data): `tweets.js` and `direct-messages.js`.

Not accessible: voice and video calls, Spaces, encrypted (XChat) DMs, Grok, Communities admin, Premium and payment features, and anything only the native apps do.

There is no X-specific server route or page screen. X goes through the generic code: live pull, the default sender, message actions, the connection guide and auto-import.

## Legend

- **Status**: Supported = works end to end in the app a user runs; Partial = works with the limit named in the notes ("fix in progress (R-Z<n>)" = a fix is being built right now); Not supported = not built although reachable; Not accessible = needs a capability only the official apps have.
- **Access**: API = the network's official API (endpoints named where known); Web = the network's web app in a browser, as a fallback (R-Y38); Archive = import of the network's data export; API + Web = API first, web app when the API has no such call or refuses; Not accessible = needs a capability only the official apps have.
- **Requirements**: R-IDs in [`REQUIREMENTS.md`](../REQUIREMENTS.md) that implement the feature.
- **Verification**: everything here is checked against the code on main and against fakes (test doubles). Nothing is verified against a live account. "Planned (R-Z<n>)" in the notes means later work, not in progress now.

## Messages display

| Feature                                              | Status         | Access         | Requirements | Notes / what is missing                                                                                                                                                                                                                           |
| ---------------------------------------------------- | -------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read DM events (inbox, one conversation, one-to-one) | Supported      | API            | R-E3         | Tested with fakes. Fixed (R-Z4): requests now carry `dm_event.fields` and `expansions`, so sender, timestamp, conversation id, media and users are returned.                                                                                      |
| DM pull picks the DM endpoint                        | Supported      | API            | R-E3         | Fixed (R-Z4): a saved `user-id` no longer switches the pull to mentions; it pulls DMs and mentions together, and only a conversation or participant scope pulls DMs alone.                                                                        |
| Pagination                                           | Partial        | API            | R-E3         | `pagination_token` to `meta.next_token`; tested once. No incremental `since`, so each pull re-reads (and pays for) the same events.                                                                                                               |
| Sender and chat names                                | Not supported  | API            | R-Y39        | Only ids; no `expansions=sender_id` or user lookup, so no display names. Archive DMs are id-only too.                                                                                                                                             |
| Reply / quote                                        | Partial        | API            | R-Y39        | `referenced_tweet_id` is read as the reply target; tested with a DM that has `reply_to`.                                                                                                                                                          |
| Attachments                                          | Partial        | API            | R-Y39        | Photo, video and gif kind and URL come only from legacy `media_url_https`; v2 `media_keys` give kind photo with no URL (no `expansions=attachments.media_keys`); DM media URLs need auth to download. Archive drops attachments (planned, R-Z10). |
| Reactions on messages                                | Not supported  | API            | R-Y39        | The adapter has no `react` and ignores reaction events.                                                                                                                                                                                           |
| Edited / deleted markers                             | Not accessible | Not accessible | —            | X DMs cannot be edited, and deleted-for-you is not exposed by X.                                                                                                                                                                                  |
| Link previews, long posts                            | Not supported  | API            | —            | Post text only; `note_tweet` (posts over 280 characters) is not requested, so Premium long posts are truncated.                                                                                                                                   |
| Web fallback read of a thread                        | Partial        | Web            | R-Y38        | No message id or sender selector, so ids are synthesized; selectors are unverified and the tests use fakes with no x.com fixture.                                                                                                                 |
| Mentions timeline import                             | Partial        | API            | R-E3         | Fields are only `created_at,author_id,conversation_id` (no entities, media, referenced posts, language). Needs a user id, which only the generic `user-id` secret supplies.                                                                       |

## Sending and composing

| Feature                               | Status         | Access         | Requirements | Notes / what is missing                                                                                                                                                                                                               |
| ------------------------------------- | -------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send a DM to a person                 | Partial        | API + Web      | R-E3, R-Y38  | `POST /2/dm_conversations/with/:id/messages`. Fixed (R-Z4): a post with a chat key is a DM and only an unaddressed post is public. Only a numeric user id works; there is no handle resolution.                                       |
| Reply into an existing conversation   | Partial        | API + Web      | R-E3         | Fixed (R-Z4): a reply to a stored conversation id goes to `/2/dm_conversations/:id/messages`, so it no longer fails and falls back to the browser. Not tested end to end. X profile sync reports `unsupported` (it needs OAuth 1.0a). |
| Create a group DM                     | Not supported  | API            | —            | `POST /2/dm_conversations` is not wired; the web table has no new-message flow.                                                                                                                                                       |
| Attachments in DM (photo, video, gif) | Not supported  | API + Web      | —            | Needs v2 media upload and `attachments.media_id`; sending is `{text}` only and the browser composer has no attach step.                                                                                                               |
| Edit / forward a DM                   | Not accessible | Not accessible | —            | x.com does not offer them for DMs; the web table has no such entry, which correctly disables them.                                                                                                                                    |
| Delete a DM (for me)                  | Partial        | API + Web      | R-Y38        | API `DELETE /2/dm_events/:id` is tested with fakes; the web delete and confirm selectors are untested. Endpoint existence and pricing were not verified.                                                                              |
| React to a DM                         | Partial        | Web            | R-Y38        | Web selectors only; untested on x.com.                                                                                                                                                                                                |
| Typing, read receipts, mark read      | Partial        | Web            | R-Y38        | "Mark read" only scrolls to the newest message; the API read call is not wired.                                                                                                                                                       |
| Voice / video messages, GIF pickers   | Not supported  | Web            | —            | Web-only in principle; no automation.                                                                                                                                                                                                 |
| Message requests (inbox filtering)    | Not supported  | Web            | —            | The Requests tab is not read, so DMs from non-followers may go unseen.                                                                                                                                                                |

## Chat list

| Feature                                    | Status        | Access | Requirements | Notes / what is missing                                                                                                                                                 |
| ------------------------------------------ | ------------- | ------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversation list                          | Partial       | Web    | R-Y38        | Web selectors exist but are unverified. The API adapter has no "list my conversations" call, so conversations are derived from events and the chat name is never known. |
| Unread counts, pin, mute, archive, folders | Not supported | Web    | —            | No unread selector for X; no mute or pin automation.                                                                                                                    |
| Delete / leave a conversation              | Not supported | Web    | —            | Only single messages can be deleted.                                                                                                                                    |

## Chats, groups and communities

| Feature                           | Status         | Access         | Requirements | Notes / what is missing                                                       |
| --------------------------------- | -------------- | -------------- | ------------ | ----------------------------------------------------------------------------- |
| Group DMs (read)                  | Partial        | API            | R-E3         | Same endpoints; group metadata (name, members) is not read.                   |
| Group admin (rename, add, remove) | Not supported  | API + Web      | —            | No code.                                                                      |
| Communities and Lists             | Not supported  | API            | —            | The API has endpoints for Lists and Communities but nothing is built.         |
| Spaces                            | Not accessible | Not accessible | —            | Live audio rooms have no usable API for a personal app and no web automation. |

## Profiles and contacts

| Feature                                       | Status        | Access | Requirements | Notes / what is missing                                                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------- | ------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Update own profile (name, bio, url, location) | Partial       | API    | R-E3         | Uses v1.1 `POST /1.1/account/update_profile.json` with a bearer token; v1.1 writes normally need OAuth 1.0a user context, so it very likely fails with the pasted OAuth 2.0 token (not verified). Not wired to any route and has no X test. Avatar and banner are not supported. |
| Read others' profiles and contact cards       | Not supported | API    | R-Y53        | No `GET /2/users/*` calls.                                                                                                                                                                                                                                                       |
| Follow, block, mute                           | Not supported | API    | —            | Not built; low priority for messaging.                                                                                                                                                                                                                                           |

## Search

| Feature      | Status        | Access | Requirements | Notes / what is missing                                                                              |
| ------------ | ------------- | ------ | ------------ | ---------------------------------------------------------------------------------------------------- |
| Search DMs   | Supported     | —      | —            | Messages are searched locally in the store after import. X-side DM search is not exposed by the API. |
| Search posts | Not supported | API    | —            | `GET /2/tweets/search/recent` is not wired (and costs $0.005 per post).                              |

## Media

| Feature                                     | Status        | Access    | Requirements | Notes / what is missing                                                                                                                                                |
| ------------------------------------------- | ------------- | --------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| View images and video in messages and posts | Partial       | API       | R-Y39        | Only when the legacy `media_url_https` is present; v2 media needs expansions. DM media downloads need the bearer token through a proxy route, and there is none for X. |
| Upload media                                | Not supported | API + Web | —            | See "Attachments in DM" and "Publish a post".                                                                                                                          |
| Archive media                               | Not supported | Archive   | —            | The archive parser reads text only; `tweets_media/` and DM media files are ignored (planned, R-Z10).                                                                   |

## Stickers and emoji

| Feature                 | Status        | Access | Requirements | Notes / what is missing |
| ----------------------- | ------------- | ------ | ------------ | ----------------------- |
| Emoji in text           | Supported     | —      | —            | Plain text.             |
| GIF search and stickers | Not supported | Web    | —            | Not built.              |

## Calls

| Feature               | Status         | Access         | Requirements | Notes / what is missing                 |
| --------------------- | -------------- | -------------- | ------------ | --------------------------------------- |
| Audio and video calls | Not accessible | Not accessible | —            | Native apps and a paid feature; no API. |

## Posts

| Feature                                        | Status        | Access        | Requirements | Notes / what is missing                                                                                                                  |
| ---------------------------------------------- | ------------- | ------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Publish a post                                 | Supported     | API           | R-E3         | `POST /2/tweets`, text only; tested for call shape only. $0.015 per post, $0.20 with a URL.                                              |
| Reply, quote, thread, polls, media, scheduling | Not supported | API + Web     | —            | The body is `{text}` only: no reply, `quote_tweet_id`, media or poll.                                                                    |
| Delete a post                                  | Not supported | API           | —            | `DELETE /2/tweets/:id` is not wired; message deletion only calls the DM endpoint.                                                        |
| Read own timeline / posts                      | Partial       | API + Archive | R-E3         | Archive tweets go to chat `wall:self`; live read of own posts (`GET /2/users/:id/tweets`) is not wired, only mentions.                   |
| Like, repost, bookmark, follow                 | Not supported | API + Web     | —            | Not built.                                                                                                                               |
| Home timeline and notifications                | Not supported | Web           | —            | Not built.                                                                                                                               |
| Display of posts in the page                   | Partial       | —             | R-Y39        | Posts are stored as ordinary links in chat `post:<id>` or `wall:self`; no post-specific rendering (counts, quotes) and no X page screen. |

## Bots

| Feature                     | Status         | Access         | Requirements | Notes / what is missing |
| --------------------------- | -------------- | -------------- | ------------ | ----------------------- |
| Bots and automated accounts | Not accessible | Not accessible | —            | Personal account only.  |

## Settings

| Feature                                        | Status        | Access | Requirements | Notes / what is missing                                       |
| ---------------------------------------------- | ------------- | ------ | ------------ | ------------------------------------------------------------- |
| Privacy, DM permissions, muted words, security | Not supported | Web    | —            | Out of scope, low priority.                                   |
| Account switching                              | Partial       | —      | —            | One token (`secret:x:token`) per app; no multi-account for X. |

## Notifications

| Feature                              | Status        | Access | Requirements | Notes / what is missing                                                                                                        |
| ------------------------------------ | ------------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| New DM notification and live updates | Not supported | API    | —            | Needs polling or the Account Activity API / webhook (about $0.010 per `dm.received` event); only manual or polled pulls exist. |

## Accounts

| Feature                        | Status    | Access | Requirements | Notes / what is missing                                                                                                                                                                                                         |
| ------------------------------ | --------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect with an API token      | Partial   | API    | R-E3         | The guide pastes a bearer token and probes `GET /2/users/me`. No OAuth 2.0 PKCE flow, no refresh token, no scope validation; app-only bearer tokens cannot read DMs, and the guide does not say pay-per-use credits are needed. |
| Connect with a browser sign-in | Supported | Web    | R-Y38        | A login URL plus a persistent browser profile; existing browser sessions for x.com / twitter.com can be imported. Login walls are not specially guided.                                                                         |

## Automation and greetings

| Feature                       | Status        | Access    | Requirements | Notes / what is missing                                                                                                                                                           |
| ----------------------------- | ------------- | --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greetings by DM               | Partial       | API + Web | R-Y38        | Greetings call the API post directly (no web fallback) and have the same conversation / participant mapping problem. Automation send safety is being worked on separately (R-Z3). |
| Automation rules sending on X | Partial       | API + Web | R-Y38        | Go through the default sender; no X test.                                                                                                                                         |
| CV sync                       | Not supported | —         | —            | No CV plan for X. Bio sync exists only through the profile update call (see Profiles).                                                                                            |

## Import and export

| Feature                                     | Status    | Access  | Requirements | Notes / what is missing                                                                                                                                     |
| ------------------------------------------- | --------- | ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive import: tweets                      | Partial   | Archive | R-E3         | Tested minimally. Replies, media, quote and retweet flags are dropped and the timestamp is a raw string (planned, R-Z10).                                   |
| Archive import: DMs (one-to-one and groups) | Partial   | Archive | R-E3         | `direct-messages.js` is read; `direct-messages-group.js` does not match the file pattern, so group DMs are skipped (planned, R-Z10). Tested for one-to-one. |
| Export and backup                           | Supported | —       | —            | The generic store backup.                                                                                                                                   |

## Counts

| Section                       | Supported | Partial | Not supported | Not accessible |
| ----------------------------- | --------- | ------- | ------------- | -------------- |
| Messages display              | 2         | 5       | 3             | 1              |
| Sending and composing         | 0         | 5       | 4             | 1              |
| Chat list                     | 0         | 1       | 2             | 0              |
| Chats, groups and communities | 0         | 1       | 2             | 1              |
| Profiles and contacts         | 0         | 1       | 2             | 0              |
| Search                        | 1         | 0       | 1             | 0              |
| Media                         | 0         | 1       | 2             | 0              |
| Stickers and emoji            | 1         | 0       | 1             | 0              |
| Calls                         | 0         | 0       | 0             | 1              |
| Posts                         | 1         | 2       | 4             | 0              |
| Bots                          | 0         | 0       | 0             | 1              |
| Settings                      | 0         | 1       | 1             | 0              |
| Notifications                 | 0         | 0       | 1             | 0              |
| Accounts                      | 1         | 1       | 0             | 0              |
| Automation and greetings      | 0         | 2       | 1             | 0              |
| Import and export             | 1         | 2       | 0             | 0              |
| **Total**                     | **7**     | **22**  | **24**        | **5**          |

## Known gaps

1. Reading DMs now returns sender, time and conversation id, and a saved user id no longer sends pulls to mentions (fixed, R-Z4).
2. Sending a DM works only by numeric user id; replying inside an existing conversation now uses the conversation endpoint (fixed, R-Z4).
3. Access and cost are invisible in the app: pay-per-use credits, a pasted token with no OAuth flow, refresh or scope check. No fix is scheduled.
4. The browser fallback is a set of unverified guesses; nothing has been tried on a live x.com.
5. Media in and out is missing, and the archive import skips group DMs and media (archive parts planned, R-Z10).
6. Posting is plain text only: no delete, reply, quote or media.
7. Profile update probably fails with an OAuth 2.0 token; this is unconfirmed.
8. The requirement R-E3 reads as done, but several paths have only thin tests.
