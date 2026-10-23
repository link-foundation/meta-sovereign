# PeoplePerHour feature matrix (languages: en • [zh](peopleperhour.zh.md) • [hi](peopleperhour.hi.md) • [ru](peopleperhour.ru.md))

Back to the [Telegram feature support matrix](../FEATURES.md).

## Scope and access

Issue #12 asks the same as issue #4 (Upwork) for PeoplePerHour, in both JavaScript and Rust. The requirement rows R-T1..R-T22 all say "Done", but the Rust half is only a name in a list and the JavaScript half rests on guessed endpoints. Nothing here was verified against a live PeoplePerHour account. Code: `js/src/sources/peopleperhour.js`.

**Endpoints are unverified and guessed.** All API paths below are invented from convention, not taken from documentation.

- **Official API**: not confirmed to exist for a personal account. A web search for PeoplePerHour developer documentation returned only third-party scrapers, no peopleperhour.com page, and the repo's own research (issue #12) says the developer portal is gated and every endpoint path is unverified. The paths `GET /projects/search`, `/workstreams`, `/workstreams/{id}/messages`, `/proposals/{id}/messages`, `/projects/{id}/proposals`, `/me/proposals` and the probe `GET /api/v1/me` are guesses. The OAuth authorisation and token URLs are unverified too. Treat the whole API route as "may not exist".
- **Web app in a browser** (`https://www.peopleperhour.com/`): there is no `WEB_UIS` entry (only vk, telegram, whatsapp, x, facebook, linkedin and upwork have one), so the browser sender cannot read or send PeoplePerHour at all. This is the realistic route and it is entirely unbuilt.
- **Archive import**: a JSON envelope and an Earnings CSV. The real shape of PeoplePerHour's data export is not verified.
- **Not accessible**: the mobile app, PeoplePerHour-hosted video or call features, and escrow release flows.

Inbox pull is done: a Fetch now button and a 5 minute schedule (R-Z8). The 24-hour cache purge now runs by itself, hourly (R-Z7). Token refresh stays unsupported: it needs the app's client id and secret, which the app does not hold (R-Z7).

## Legend

- **Status**: Supported = works end to end in the app a user runs; Partial = works with the limit named in the notes (a fix being worked on now is marked "fix in progress (R-Z<n>)"; it still counts as Partial); Not supported = not built; Not accessible = needs a capability only the official apps have.
- **Access**: API = a PeoplePerHour API whose existence is unconfirmed (every path is "guessed"); Web = the PeoplePerHour web app in a browser (not built); Archive = file import; Not accessible = needs the official apps.
- **Requirements**: R-IDs in [`REQUIREMENTS.md`](../REQUIREMENTS.md) that deliver the feature. "—" means no requirement row covers it. A requirement row saying "Done" does not mean the feature is verified.
- **Verification**: everything is tested only with fakes (injected `fetch` / fake browser). Nothing here was checked against a live account. "planned (R-Z<n>)" marks work queued for a later wave; it does not change the status.

## Messages display

| Feature                                   | Status        | Access                                                                                    | Requirements | Notes / what is missing                                                                                                       |
| ----------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Read workstream messages (after hire)     | Partial       | API `GET /workstreams/{id}/messages` (guessed)                                            | R-T6         | Endpoint guessed; tested with fakes only.                                                                                     |
| Read proposal-room messages (before hire) | Partial       | API `GET /proposals/{id}/messages`, `/projects/{id}/proposals`, `/me/proposals` (guessed) | R-T5         | Endpoints guessed; tested with fakes only.                                                                                    |
| Read by `roomId`                          | Not supported | API                                                                                       | —            | The pull returns an empty result for `roomId`, yet chats are named `room:<id>`, so a room-based caller silently gets nothing. |
| Read via web app                          | Not supported | Web                                                                                       | R-Y38        | No `WEB_UIS` entry, so the browser pull cannot read PeoplePerHour.                                                            |
| Message fields (sender, text, time)       | Partial       | API                                                                                       | R-Y39        | Attachments, reactions and edits are not supported.                                                                           |
| Raw form of a message                     | Supported     | API + Archive                                                                             | R-Y28        | Covered by the raw-parity test.                                                                                               |

## Sending and composing

| Feature                              | Status        | Access                                                                      | Requirements | Notes / what is missing                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ------------- | --------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Send text to a workstream / proposal | Partial       | API `POST /workstreams/{id}/messages`, `/proposals/{id}/messages` (guessed) | R-T8         | `livePost` needs `workstreamId` or `proposalId`, but the Chat sender passes only the chat, so Chat/automation sends throw "requires options.workstreamId". The dedicated route `POST /api/peopleperhour/post-message` and the CLI take the ids explicitly. No browser fallback exists to catch it. |
| Attachments / files                  | Not supported | API                                                                         | —            | Not built.                                                                                                                                                                                                                                                                                         |
| Edit / delete / react                | Not supported | Web                                                                         | —            | Not built; no web route exists.                                                                                                                                                                                                                                                                    |

## Chat list

| Feature                          | Status        | Access                                        | Requirements | Notes / what is missing               |
| -------------------------------- | ------------- | --------------------------------------------- | ------------ | ------------------------------------- |
| List workstreams / conversations | Partial       | API `GET /workstreams?perspective=` (guessed) | R-T6, R-T7   | The `perspective` values are guesses. |
| Unread counts, archive, mute     | Not supported | API                                           | —            | Not built.                            |

## Projects, proposals, workstreams

| Feature                                         | Status        | Access                               | Requirements | Notes / what is missing                                                                |
| ----------------------------------------------- | ------------- | ------------------------------------ | ------------ | -------------------------------------------------------------------------------------- |
| Search projects (including "hourlies")          | Partial       | API `GET /projects/search` (guessed) | R-T4         | Route `/api/peopleperhour/search` and a CLI command exist. Fakes only. No page screen. |
| Project detail, budget, skills                  | Partial       | API + Archive                        | R-T10        | A project link type exists; the live fields are guesses.                               |
| List my proposals                               | Partial       | API `/me/proposals` (guessed)        | R-T5         | Used only inside the pull, not as a separate listing.                                  |
| Submit / edit / withdraw a proposal, buy Offers | Not supported | Web                                  | —            | The freelancer's main action is absent.                                                |
| Post a project as buyer, review proposals, hire | Not supported | Web                                  | R-T7         | R-T7 is only a listing parameter, not a buyer workflow.                                |
| Hourly workstreams, hourstreams, invoices       | Partial       | Archive                              | R-T11        | Links are created from an archive only; no live pull.                                  |
| "Hourlie" (fixed offer) management              | Not supported | Web                                  | —            | Not built.                                                                             |

## Profile and CV

| Feature                                               | Status        | Access | Requirements | Notes / what is missing                                                                                                                                                                     |
| ----------------------------------------------------- | ------------- | ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read / update freelancer profile, hourlies, portfolio | Not supported | Web    | —            | No CV plan exists for PeoplePerHour.                                                                                                                                                        |
| Resume sync (no support)                              | Not supported | API    | R-D6         | PeoplePerHour is accepted as a resume-sync target but has no `syncResume`. Fixed (R-Z4): the sync now reports `ok: false` (`unsupported`) instead of success; there is still no real write. |

## Notifications, accounts, not accessible

| Feature                                           | Status         | Access         | Requirements | Notes / what is missing                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | -------------- | -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notifications                                     | Partial        | API            | —            | Connections has a "Fetch now" button on the PeoplePerHour card (`POST /api/pull`, at most one fetch per 15 s) and the server fetches workstreams and proposals every 5 minutes, with backoff after failures; the schedule starts only after the server listens. Each fetch re-reads them and stores them again under the same ids. There are no alerts. Tested with a fake PeoplePerHour and in the browser (R-Z8). |
| Token flow                                        | Partial        | API            | R-T15, R-T16 | The access token is pasted by hand. A refresh token is stored but never used: refreshing needs the app's client id and secret, which the app does not hold (R-Z7); there are no OAuth endpoints and the probe `GET /api/v1/me` is a guess.                                                                                                                                                                          |
| 24 h cache retention                              | Supported      | local          | R-T12        | The purge runs on its own, once the server is up and then every hour, and deletes live-pulled links older than 24 hours; links imported from an export stay (R-Z7).                                                                                                                                                                                                                                                 |
| Mobile app, video / call features, escrow release | Not accessible | Not accessible | —            | Only the official apps and site offer these.                                                                                                                                                                                                                                                                                                                                                                        |

## Import, export and automation

| Feature             | Status        | Access  | Requirements | Notes / what is missing                                                                                                                                       |
| ------------------- | ------------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Earnings CSV import | Partial       | Archive | R-T2, R-T9   | Tested, but the header it expects (`Date,Type,Description,Net,Gross,Buyer,Freelancer,Reference`) is a guess; the real PeoplePerHour export header is unknown. |
| Auto-import recipe  | Partial       | Web     | —            | Only opens the site home page and takes `.json`/`.csv` files.                                                                                                 |
| CLI                 | Supported     | Server  | R-T13        | `peopleperhour-search`, `peopleperhour-message`, `source-pull`.                                                                                               |
| Server routes       | Partial       | Server  | R-T14        | Search and post-message routes exist; no test hits them.                                                                                                      |
| Page screen         | Partial       | UI      | R-T15        | Only the connection guide; no search or message screen.                                                                                                       |
| Rust server         | Not supported | API     | —            | Name-list stub only; the Rust half of issue #12 is not done. Rust parity is documented, not built.                                                            |

## Counts

| Section                                 | Supported | Partial | Not supported | Not accessible |
| --------------------------------------- | --------- | ------- | ------------- | -------------- |
| Messages display                        | 1         | 3       | 2             | 0              |
| Sending and composing                   | 0         | 1       | 2             | 0              |
| Chat list                               | 0         | 1       | 1             | 0              |
| Projects, proposals, workstreams        | 0         | 4       | 3             | 0              |
| Profile and CV                          | 0         | 0       | 2             | 0              |
| Notifications, accounts, not accessible | 1         | 2       | 0             | 1              |
| Import, export and automation           | 1         | 4       | 1             | 0              |
| **Total**                               | **3**     | **15**  | **11**        | **1**          |

## Known gaps

1. The API may not exist for personal accounts and every endpoint path is a guess. The realistic route is the web app, and it is not built (no `WEB_UIS` entry), so Chat can neither read nor send PeoplePerHour reliably.
2. Sending from Chat throws because the workstream or proposal id is not derived from the chat; reading by `roomId` silently returns nothing.
3. Resume sync for PeoplePerHour now reports `unsupported` instead of success (fixed, R-Z4). There is no PeoplePerHour CV plan.
4. No proposal submission and no page screen for project search or messages.
5. Server routes have no tests; the 24-hour cache purge now runs (R-Z7); the refresh token stays unused (it needs a client secret the app does not hold, R-Z7); inbox pull is done and tested with fakes (R-Z8); the Rust half of issue #12 is not done.
6. Nothing has been verified against a live PeoplePerHour account; all tests use fakes.
