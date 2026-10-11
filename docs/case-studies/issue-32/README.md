# Issue 32 Case Study: alternatives to Kate Mobile tokens

Issue: https://github.com/link-foundation/meta-sovereign/issues/32

Prepared on 2026-10-11 UTC for PR 33.

## Summary

Issue 32 asks which VK applications listed on
[vkhost.github.io](https://vkhost.github.io/) still carry the elevated
rights Kate Mobile used to have, meaning a long-lived (`offline`) user
token with the `messages` right. It also asks that the answer favour
trusted sources over small, unknown applications that could misuse
personal data.

Short answer:

1. **No new application can get these rights any more.** VK stopped
   granting the user `messages` right to new applications in June 2024
   («Для новых приложений это право не выдаётся», "this right is not
   granted to new applications"). User-token Implicit Flow and
   Authorization Code Flow have been disabled since 25 June 2024. Only
   client_ids that were approved earlier still have the right. Every
   "Kate Mobile alternative" therefore borrows somebody else's legacy
   client_id.
2. **Kate Mobile itself is gone.** VK's platform rules
   (edition 19.08.2026) cap every VK ID business account at
   100,000,000 calls a month from 7 September 2026. Kate's traffic
   (about 3 billion calls a month) exhausts that in about 1.5 days, and
   VK support told its developers further quota is paid (estimated at
   about 15 million rubles a month). Since 8 September 2026 its tokens
   get "Flood control" on every call.
3. **Several VK-owned client_ids still pass the OAuth gate.** On
   2026-10-11 the gate still served a login page for `messages,offline`
   to the vk.com web client (6287487), VK Calls (7793118), Marusya
   (6463690), VK Mail (7799655), Sferum web (7556576) and VK Connect
   (7497650). Of these, community reports after the Kate ban name only
   **vk.com (6287487)** and **VK Calls (7793118)** as working for
   messages. Marusya works, but users report account freezes.
4. **The third-party options (Prisma, VFeed, the old Instagram
   integration) also pass the gate, but they rank below every VK-owned
   client.** They are exactly the "small applications" the issue warns
   about. Users also report freezes after using them.
5. **The durable routes are the official ones:**
   - the data archive from `vk.com/data_protection`, which meta-sovereign
     already imports;
   - a **community token** with Bots Long Poll or the Callback API, for
     chats where the user is a community admin;
   - an own VK ID application, for profile data only.

The implementation keeps this research reusable. It does not quietly
switch meta-sovereign to a borrowed client.

- `js/src/sources/vk-auth.js`:
  - `VK_TOKEN_SOURCES`: every vkhost client plus VK's native clients,
    each with publisher, OAuth-gate outcome, recommendation and dated
    evidence.
  - `rankVkTokenSources()`: VK-owned clients first; third-party clients
    only if explicitly asked for.
  - `classifyVkOAuthGate()` / `probeVkOAuthGate()`: re-run the probe
    without an account.
  - `inspectVkToken()`: three documented read-only calls that say whether
    a token the user already holds can still read messages.
  - `describeVkError()`: what VK error codes 3/5/6/7/9/15/17/27/28/29
    mean for a token holder.
- The in-app VK connection guide no longer tells users to "create a
  Standalone application and request the messages scope". That path is
  closed. It now points to the archive, community tokens and, at the
  user's own risk, a legacy token of VK's own web client. It also names
  the secret id the field really uses (`secret:vk:access-token`, not
  `secret:vk:token`), in all four locales.
- The VK connector, probe and docs links move to the `vk.ru` domain
  (`api.vk.ru`, `dev.vk.ru`). VK asked developers to migrate in 2025.

## Ranked answer

The gate column comes from `verification-logs/oauth-probe*.txt`, probed
2026-10-11 without an account on both oauth.vk.com and oauth.vk.ru, with
identical results. The reports column comes from public community
threads (see [external-research.md](./external-research.md)).

| Rank | client_id | Application                 | Publisher   | Gate (2026-10-11) | Reports after 2026-09-08                                 | Recommendation |
| ---- | --------- | --------------------------- | ----------- | ----------------- | -------------------------------------------------------- | -------------- |
| 1    | 6287487   | vk.com web client           | VK          | login page        | Works for a dialog archiver where Kate and VK Admin fail | prefer         |
| 2    | 7793118   | VK Calls                    | VK          | login page        | `offline` + `messages` work (2026-07-16)                 | prefer         |
| 3    | 6463690   | Marusya                     | VK          | login page        | Works; freezes of 1-4 days reported                      | fallback       |
| 4    | 7799655   | VK Mail                     | VK          | login page        | none                                                     | fallback       |
| 5    | 7556576   | Sferum (web)                | VK          | login page        | none                                                     | fallback       |
| 6    | 7497650   | VK Connect                  | VK          | login page        | none                                                     | fallback       |
| —    | 5530956   | Prisma                      | third party | login page        | Worked in May; same user later blocked                   | avoid          |
| —    | 3698024   | Instagram (old integration) | third party | login page        | none                                                     | avoid          |
| —    | 4083558   | VFeed                       | third party | login page        | Day-long suspension reported                             | avoid          |
| —    | 2685278   | Kate Mobile                 | third party | login page        | "Flood control" on every call since 2026-09-08           | unavailable    |
| —    | 6121396   | VK Admin (Android)          | VK          | blocked           | Blocked 2026-04-13, old tokens revoked                   | unavailable    |
| —    | 5776857   | VK Admin (iOS)              | VK          | Security Error    | —                                                        | unavailable    |
| —    | 7539952   | Mail.ru Mail                | VK          | Security Error    | —                                                        | unavailable    |
| —    | 7598572   | Sferum (Android)            | VK          | disabled          | —                                                        | unavailable    |
| —    | 7571751   | VK Education (iOS)          | VK          | disabled          | —                                                        | unavailable    |
| —    | 2274003 … | Official Android/iOS/Win/Me | VK          | direct auth only  | Private password grant only; unusable from a browser     | unavailable    |

A login page is **necessary but not sufficient**. Kate Mobile still gets
one even though VK refuses its API traffic. That is why the catalogue
records community evidence next to the probe result, and why
`inspectVkToken()` exists to check a real token after login.

### Why VK-owned clients rank above third-party ones

The issue's privacy concern is narrower than it first looks. With the
flow vkhost uses (`response_type=token`,
`redirect_uri=https://oauth.vk.com/blank.html`), VK puts the token in the
fragment of a page on VK's own domain. The application's publisher
never receives it. A small publisher therefore cannot read your
messages through this token.

The risks that remain:

- The client_id can be blocked at any time, as happened to VK Admin and
  Kate Mobile, and every token issued for it dies with it. Platform rule
  4.6 lets VK cut an app off without notice for "suspicious activity"
  or user complaints, which a third-party client used by scripts invites.
- VK's anti-abuse systems freeze accounts that use these tokens. Freezes
  are reported for third-party clients (Kate, VFeed) and for Marusya.
- Trusting a small publisher still matters wherever their own software is
  involved: their app, a modified APK, or a "token helper" site that is
  not vkhost. None of these is needed to get a token.

Using a VK-owned client_id does not make the first two risks disappear.
It removes the third-party publisher from the picture.

### Terms-of-service caveat

VK's platform rules (19.08.2026) do not explicitly forbid using another
application's client_id. They do require:

- documented methods only, with undocumented ones «будут поэтапно
  ограничены» ("will be restricted step by step");
- no presenting an app as an official VK product (1.4);
- no collecting data unrelated to the app, or passing it to third
  parties (2.1/2.2).

A borrowed token is a grey area that VK actively polices with account
freezes. meta-sovereign therefore documents it as a user-chosen,
at-your-own-risk option and never makes it the default.

## Timeline

| Date          | Event                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2022-10-17    | Client Credentials Flow disabled.                                                                                                       |
| 2024-06-25    | User-token Implicit Flow and Authorization Code Flow disabled; `messages` no longer granted to new apps; Standalone apps move to VK ID. |
| 2025-09-02    | VK asks developers to move to the vk.ru domain by 30 September (vkhost issue #4).                                                       |
| 2025-11-07    | VK Admin (iOS) answers "Security Error" (vkhost issue #5).                                                                              |
| 2026-04-13    | VK Admin (Android) blocked, old tokens revoked; users move to Kate Mobile (vkhost issue #6, gist).                                      |
| 2026-05       | Kate tokens "ограничены вдоль и поперек" ("restricted every which way"); bans after Kate and VFeed reported.                            |
| 2026-06-25    | 24-hour account restrictions after using a Kate token reported.                                                                         |
| 2026-07-15/16 | VK Calls reported working with `offline` + `messages`; Marusya token leads to a 4-day freeze.                                           |
| 2026-08-19    | New platform rules: documented methods only, monthly call limits from 7 September.                                                      |
| 2026-09-07/08 | Limits take effect; borrowed-token calls answer "Flood control"; Kate Mobile's developers announce it has stopped working.              |
| 2026-09-30    | A dialog archiver's users report the vk.com (6287487) token works where VK Admin and Kate fail.                                         |
| 2026-10-01    | Kate Mobile still not working (info24.ru).                                                                                              |
| 2026-10-11    | This probe: 10 client_ids still pass the gate, 6 of them VK-owned.                                                                      |

## How to reproduce

```bash
# OAuth gate for every vkhost client + official clients + controls.
# No account or cookie is used.
node experiments/issue-32/probe-vk-oauth-apps.mjs           # oauth.vk.com
node experiments/issue-32/probe-vk-oauth-apps.mjs --vk-ru   # oauth.vk.ru
node experiments/issue-32/probe-vk-oauth-apps.mjs --json

# Ranked list, and inspection of a token you already hold.
node examples/vk-token-check.mjs --sources
VK_ACCESS_TOKEN=... node examples/vk-token-check.mjs
```

Two control client_ids pin the meaning of each answer:

- 999999999 has never existed and returns `deleted`.
- 12345 is a web app that may not ask for messages and returns
  `no-messages`.

## Local artifacts

- `data/`: raw evidence, fetched 2026-10-11.
  - Issue and PR JSON.
  - The vkhost page and its `script.js?210829`, plus all vkhost issues
    and comments.
  - The AlexanderPro gist comments.
  - The VK-Dialog-Photo-Archiver#2 thread.
  - Text snapshots of the dev.vk.ru pages used below, and the platform
    rules (edition 19.08.2026).
  - A digest of the press coverage of the Kate Mobile shutdown
    (`news-kate-mobile-ban.md`).
- `verification-logs/`:
  - OAuth gate probe runs: the first run, a re-run with the shared
    classifier, and oauth.vk.ru.
  - The token checker against the real api.vk.ru with a bogus token,
    which shows VK error 5 and its hint.
  - Local test, lint, format and duplication runs.
- `screenshots/`: the rewritten VK connection guide in English and
  Russian, produced by `experiments/issue-32/vk-guide-screenshot.mjs`
  against the real server.
- [requirements.md](./requirements.md): issue sentences mapped to
  evidence.
- [solution-plan.md](./solution-plan.md): options considered and why
  this one was chosen.
- [external-research.md](./external-research.md): every source, with
  quotes.

## Limitations

- **No VK account was used.** The probe stops at the login page, so the
  "works after login" column relies on dated community reports, not on
  our own test. `inspectVkToken()` is the tool for checking that column
  with a real token, and its result is not stored anywhere.
- **The picture changes quickly.** VK cut off three popular client_ids
  in under a year (VK Admin iOS in 2025-11, VK Admin in 2026-04, Kate in
  2026-09). The catalogue carries its probe
  date (`VK_TOKEN_SOURCES_PROBED_AT`) so stale data is visible.
- The VK ID OAuth 2.1 flow (`id.vk.ru`) was not pursued for messages.
  It only issues `vkid.personal_info`, `email` and `phone` to new apps,
  and its user access keys live one hour (dev.vk.ru getting-started).
