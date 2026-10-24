# LinkedIn feature matrix (languages: en • [zh](linkedin.zh.md) • [hi](linkedin.hi.md) • [ru](linkedin.ru.md))

Back to the [Telegram feature matrix](../FEATURES.md). This page covers LinkedIn only.

## Scope and access

1. **Official API.** Docs: Posts API <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api> and Sign In with LinkedIn (OIDC) <https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2>.
   - Self-serve for a member: `openid profile email` (OIDC `GET /v2/userinfo`: sub, name, picture, locale, email) and `w_member_social` (create, update by PARTIAL_UPDATE of the commentary, and delete posts; images, video, documents, multi-image, poll, article, reshare).
   - **Restricted:** `r_member_social` (read own posts, comments, likes) is for approved users only, so even reading your own posts through `GET /rest/posts?q=author` is not available to a normal personal app.
   - **The Messaging API is partner-only**, with no self-serve access (general knowledge): no personal message read or send. The profile edit API is also for partner programs only.
2. **Web app in a browser** (linkedin.com/messaging, /in/me): the only route to read and send messages and to edit the profile. LinkedIn blocks automated traffic aggressively, so any automation carries an account-restriction risk.
3. **Data export archive** (Settings > Get a copy of your data): `messages.csv` is imported. The other CSVs (Connections, Profile, Positions, Skills, Shares, Comments, Invitations) are not.

Not accessible: calls, video meetings, Premium and InMail credits, Sales Navigator, recruiter tools, job application flows, and anything only the apps do.

There is no LinkedIn-specific server route or page screen except the CV screen (`/api/cv/*`). Messaging uses generic code. The web selectors have never been checked against a real signed-in LinkedIn.

## Legend

- **Status**: Supported = works end to end in the app a user runs; Partial = works with the limit named in the notes ("fix in progress (R-Z<n>)" = a fix is being built right now); Not supported = not built although reachable; Not accessible = needs a capability only the official apps have.
- **Access**: API = the network's official API (endpoints named where known); Web = the network's web app in a browser, as a fallback (R-Y38); Archive = import of the network's data export; API + Web = API first, web app when the API has no such call or refuses; Not accessible = needs a capability only the official apps have.
- **Requirements**: R-IDs in [`REQUIREMENTS.md`](../REQUIREMENTS.md) that implement the feature.
- **Verification**: everything here is checked against the code on main and against fakes (test doubles). Nothing is verified against a live account. "Planned (R-Z<n>)" in the notes means later work, not in progress now.

## Messages display

| Feature                                      | Status         | Access         | Requirements | Notes / what is missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | -------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read messages live via the API               | Not accessible | Not accessible | R-E6         | LinkedIn offers no messaging API to personal apps. The adapter's live pull reads posts, not messages: with a token and `r_member_social` approval it imports the user's own posts as chat `feed:<urn>`.                                                                                                                                                                                                                                                                                                                              |
| Read messages via the web app                | Partial        | Web            | R-Y38        | Selectors for the thread and list; reads 5 chats x 20 messages by default. Selectors are unverified and there is no linkedin.com fixture test. Media and attachments, reactions and replies are not extracted.                                                                                                                                                                                                                                                                                                                       |
| Archive messages (`messages.csv`)            | Supported      | Archive        | R-E6         | Fixed (R-Z10): the id is the conversation, the ISO date (a time with no zone is read in this machine's time zone, `UTC` stays UTC), a digest of the sender and a counter, so same-second messages never collide; the sender is the profile URL with the name kept; participants, subject/title, folder (inbox, sent, archived), own-message flag and attachment URLs are kept; the date is ISO text; quoted newlines are read. Attachment files are not in the CSV, only links. Tested. The page shows those links as chips (R-Z15). |
| Attachments, voice notes, reactions, replies | Not supported  | Web + Archive  | R-Y39        | Not parsed in the browser table or in the CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Link previews and shared posts in messages   | Not supported  | Web            | —            | Not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Edited / deleted markers                     | Not supported  | Web            | —            | Not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Sending and composing

| Feature                                           | Status        | Access | Requirements | Notes / what is missing                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------- | ------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send a message                                    | Partial       | Web    | R-Y38        | Web composer and send button only; API send is not possible. Fixed (R-Z4): the LinkedIn adapter's `sendMessage` answers `unsupported` for a chat, so the web-app sender takes over, and `post` with a chat or person refuses instead of publishing a PUBLIC feed post. The web path is untested against real markup. |
| Edit / delete own message                         | Partial       | Web    | R-Y38        | Selectors exist; untested on linkedin.com.                                                                                                                                                                                                                                                                           |
| React                                             | Partial       | Web    | R-Y38        | Selectors exist; localized labels are not handled.                                                                                                                                                                                                                                                                   |
| Forward                                           | Not supported | Web    | —            | No `forward` entry in the web table.                                                                                                                                                                                                                                                                                 |
| Mark read                                         | Partial       | Web    | R-Y38        | Only scrolls to the newest message.                                                                                                                                                                                                                                                                                  |
| Attach a file, image, GIF or voice note           | Not supported | Web    | —            | No attach step.                                                                                                                                                                                                                                                                                                      |
| Start a new conversation, InMail, connection note | Not supported | Web    | —            | Needs a profile URL to Message flow; not built.                                                                                                                                                                                                                                                                      |
| Message requests and sponsored messages           | Not supported | Web    | —            | Not built.                                                                                                                                                                                                                                                                                                           |

## Chat list

| Feature                                                                             | Status        | Access | Requirements | Notes / what is missing                       |
| ----------------------------------------------------------------------------------- | ------------- | ------ | ------------ | --------------------------------------------- |
| Conversation list                                                                   | Partial       | Web    | R-Y38        | Web list with an unread selector; unverified. |
| Focused / Other / Unread / My Connections filters, archive, mute, star, mark unread | Not supported | Web    | —            | Not built.                                    |
| Delete a conversation                                                               | Not supported | Web    | —            | Not built.                                    |

## Chats, groups and communities

| Feature                                     | Status        | Access        | Requirements | Notes / what is missing                                                                                                                   |
| ------------------------------------------- | ------------- | ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Group conversations                         | Partial       | Web + Archive | —            | Thread ids work; participants are unknown.                                                                                                |
| LinkedIn Groups, Pages, Events, Newsletters | Not supported | API + Web     | —            | Organization posts need `w_organization_social` and an admin role; an `organizationId` option key exists but the adapter does not use it. |

## Profiles and contacts

| Feature                                                                           | Status        | Access        | Requirements | Notes / what is missing                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | ------------- | ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read own profile (name, headline, location, about, skills, experience, education) | Partial       | Web           | R-V7, R-E11  | CV plan read steps: 7 verified and 25 draft steps per `docs/CV-SYNC.md`; tested with a fake commander only. Real markup is unverified. Languages, certifications, projects, publications, volunteer, honors, recommendations, photo, banner, contact info and custom URL are not read.                                                                                                              |
| Update headline / location                                                        | Partial       | Web           | R-V7         | Fills only the headline field. `basics.location` is declared writable but no step fills it, and first and last name cannot be changed. Tested against fakes only.                                                                                                                                                                                                                                   |
| Update About                                                                      | Partial       | Web           | R-V7         | Group `about`; tested against fakes only.                                                                                                                                                                                                                                                                                                                                                           |
| Update skills                                                                     | Partial       | Web           | R-V7         | Add only: no removal or reorder, one skill per runner iteration.                                                                                                                                                                                                                                                                                                                                    |
| Update experience / education                                                     | Not supported | Web           | R-V7         | Read only; `docs/CV-SYNC.md` says writes are reported as "unsupported".                                                                                                                                                                                                                                                                                                                             |
| Profile publication through the API                                               | Not supported | API           | R-E6         | The `syncProfile` / `syncResume` calls do NOT update the profile. Fixed (R-Z4): they answer `unsupported` unless the caller passes `shareAsPost`, which publishes a PUBLIC feed post with the name, headline and about text (or "title + summary + #skills") and exists only at the API level; no screen asks for it. R-E6 and `/api/resume` (R-D6) call this profile publication, which it is not. |
| Read connections / contacts                                                       | Not supported | Archive + Web | R-Y53        | `Connections.csv` is not imported and there is no connection-list scrape. The Connections API is not available.                                                                                                                                                                                                                                                                                     |
| View another person's profile                                                     | Not supported | Web           | —            | Learned from shared links only (R-Y53).                                                                                                                                                                                                                                                                                                                                                             |
| Sign-in identity (OIDC userinfo)                                                  | Not supported | API           | —            | The connection guide probes `GET /v2/me`, which needs profile permissions that "Share on LinkedIn" does not give; the self-serve call is OIDC `GET /v2/userinfo`. The probe may report failure while the token is valid for posting.                                                                                                                                                                |

## Search

| Feature                                          | Status        | Access | Requirements | Notes / what is missing                                          |
| ------------------------------------------------ | ------------- | ------ | ------------ | ---------------------------------------------------------------- |
| Search people, jobs, posts, messages on LinkedIn | Not supported | Web    | —            | Local store search only; the People Search API is not available. |

## Media

| Feature                                                      | Status        | Access        | Requirements | Notes / what is missing                                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------- | ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show message attachments                                     | Partial       | Web + Archive | R-Y39        | The archive's attachment links (`messages.csv` has no files) are shown as link chips in the message (R-Z15); the web app does not read attachments.                                                         |
| Post with image, video, document, multi-image, poll, article | Not supported | API           | —            | Posting sends text only with visibility `PUBLIC` and `MAIN_FEED`; the Posts API supports all of these via the Images, Videos and Documents APIs with `w_member_social`. No `CONNECTIONS` visibility option. |

## Stickers and emoji

| Feature | Status    | Access | Requirements | Notes / what is missing |
| ------- | --------- | ------ | ------------ | ----------------------- |
| Emoji   | Supported | —      | —            | Text only.              |

## Calls

| Feature            | Status         | Access         | Requirements | Notes / what is missing                      |
| ------------------ | -------------- | -------------- | ------------ | -------------------------------------------- |
| Calls and meetings | Not accessible | Not accessible | —            | No call API and no web automation; app-only. |

## Posts

| Feature                                        | Status        | Access    | Requirements | Notes / what is missing                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------- | --------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publish a text post                            | Supported     | API       | R-E6         | `POST /rest/posts` with `Linkedin-Version: 202604` and `X-Restli-Protocol-Version: 2.0.0`, matching the doc; tested for the call only. Needs `w_member_social` and the author URN (`secret:linkedin:author-urn`), which the user must type by hand; OIDC `sub` to `urn:li:person:<sub>` is not derived. The version string needs periodic updating. |
| Post id from the response                      | Not supported | API       | —            | The new post id is in the `x-restli-id` header, but the request helper returns only the body, so the id is likely lost. It is needed for edit and delete.                                                                                                                                                                                           |
| Edit / delete own post                         | Not supported | API       | —            | `POST /rest/posts/{urn}` with PARTIAL_UPDATE and `DELETE /rest/posts/{urn}` are not wired.                                                                                                                                                                                                                                                          |
| Read own posts (API, restricted)               | Partial       | API       | R-E6         | Works only with `r_member_social`, which needs LinkedIn approval. Paging is inconsistent: the next offset returned is a link href, not a start index. Media, reshare context and `viewContext=AUTHOR` are ignored. Tested with a fake.                                                                                                              |
| Read own posts from the archive (`Shares.csv`) | Not supported | Archive   | —            | Not imported.                                                                                                                                                                                                                                                                                                                                       |
| Reshare, comments, reactions on posts          | Not supported | API + Web | —            | `w_member_social` allows comments and likes through the Social Actions API; there is no code.                                                                                                                                                                                                                                                       |
| Feed, notifications, mentions                  | Not supported | Web       | —            | Not built.                                                                                                                                                                                                                                                                                                                                          |
| Scheduling                                     | Not supported | Web       | —            | The API has a DRAFT lifecycle that is unused.                                                                                                                                                                                                                                                                                                       |

## Bots

| Feature | Status         | Access         | Requirements | Notes / what is missing                |
| ------- | -------------- | -------------- | ------------ | -------------------------------------- |
| Bots    | Not accessible | Not accessible | —            | Personal account only; no bot concept. |

## Settings

| Feature                                          | Status        | Access | Requirements | Notes / what is missing        |
| ------------------------------------------------ | ------------- | ------ | ------------ | ------------------------------ |
| Privacy, visibility, open-to-work, notifications | Not supported | Web    | —            | "Open to work" has no CV path. |

## Notifications

| Feature            | Status        | Access | Requirements | Notes / what is missing                                                       |
| ------------------ | ------------- | ------ | ------------ | ----------------------------------------------------------------------------- |
| New message alerts | Not supported | Web    | —            | Only manual or polled browser reads; no webhook exists for personal accounts. |

## Accounts

| Feature                                             | Status  | Access | Requirements | Notes / what is missing                                                                                                                                                                                                    |
| --------------------------------------------------- | ------- | ------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect with an API token and author URN            | Partial | API    | R-E6         | The token is pasted by hand (no OAuth 2.0 authorization-code flow); it expires in about 60 days and refresh tokens are partner-only; no expiry tracking.                                                                   |
| Connect with a browser session (persistent profile) | Partial | Web    | R-V7, R-Y38  | A `session-cookie` secret reference exists, and sessions can be imported from other browsers. Login, captcha and 2FA walls are a dead end with no LinkedIn-specific guidance; only the expired-session redirect is tested. |

## Automation, greetings and CV sync

| Feature                                        | Status    | Access | Requirements          | Notes / what is missing                                                                                                                                                                                                             |
| ---------------------------------------------- | --------- | ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CV read across platforms                       | Partial   | Web    | R-V7, R-V14..V19, #29 | Implemented end to end (plan, runner, `/api/cv/*`, CV screen, CLI `cv-read`), but tests use fakes only, so selectors have never run against the real site. A LinkedIn UI language other than English breaks `aria-label` selectors. |
| CV compare and sync (LinkedIn vs hh etc.)      | Partial   | Web    | R-V2, R-V15           | Writes are limited to headline, location (unfilled), about and skills; tested against fakes. Fixed (R-Z4): a sync that did not really write reports `ok: false` with a code, never success.                                         |
| Telemetry and markup fingerprints              | Supported | Web    | R-V13                 | Tested (`cv-telemetry`).                                                                                                                                                                                                            |
| Greetings and automations on LinkedIn messages | Partial   | Web    | R-Y38                 | Greetings and automations use the chat-only `sendMessage`, so for LinkedIn they go through the web-app sender and never publish a public post (fixed, R-Z4). Automation send safety is also covered by R-Z3.                        |

## Import and export

| Feature                                                                   | Status        | Access  | Requirements | Notes / what is missing                                                                                            |
| ------------------------------------------------------------------------- | ------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Import `messages.csv`                                                     | Supported     | Archive | R-E6         | See "Archive messages". Importing twice adds nothing (R-Z10); a failed store write stops the import with an error. |
| Import Connections, Profile, Positions, Shares, Comments, Invitations CSV | Not supported | Archive | —            | The file pattern matches `messages.csv` only (planned, R-Z10).                                                     |
| Export the CV to links notation                                           | Supported     | —       | R-V1         | `cvToLino`; tested.                                                                                                |

## Counts

| Section                           | Supported | Partial | Not supported | Not accessible |
| --------------------------------- | --------- | ------- | ------------- | -------------- |
| Messages display                  | 1         | 1       | 3             | 1              |
| Sending and composing             | 0         | 4       | 4             | 0              |
| Chat list                         | 0         | 1       | 2             | 0              |
| Chats, groups and communities     | 0         | 1       | 1             | 0              |
| Profiles and contacts             | 0         | 4       | 5             | 0              |
| Search                            | 0         | 0       | 1             | 0              |
| Media                             | 0         | 1       | 1             | 0              |
| Stickers and emoji                | 1         | 0       | 0             | 0              |
| Calls                             | 0         | 0       | 0             | 1              |
| Posts                             | 1         | 1       | 6             | 0              |
| Bots                              | 0         | 0       | 0             | 1              |
| Settings                          | 0         | 0       | 1             | 0              |
| Notifications                     | 0         | 0       | 1             | 0              |
| Accounts                          | 0         | 2       | 0             | 0              |
| Automation, greetings and CV sync | 1         | 3       | 0             | 0              |
| Import and export                 | 2         | 0       | 1             | 0              |
| **Total**                         | **6**     | **18**  | **26**        | **3**          |

## Known gaps

1. A LinkedIn chat message no longer becomes a public feed post, and profile or resume sync is `unsupported` unless `shareAsPost` is passed (fixed, R-Z4). Messages to LinkedIn go through the web app, which is untested against the real site.
2. Messaging has only the browser route, and its selectors are unverified; LinkedIn may restrict an automated account.
3. The archive import reads `messages.csv` fully (R-Z10); Connections, Shares and Profile files are still not imported (planned, R-Z10).
4. Profile writing covers only headline, About and skills; location, experience and education are not written.
5. Post lifecycle through the API is minimal: no post id, edit, delete, media, or connections-only visibility; the author URN is typed by hand.
6. Reading your own posts needs LinkedIn's approval for `r_member_social`.
7. Contacts and connections are not imported.
8. Low priority: reshare, comments, Pages, polls, scheduling.
