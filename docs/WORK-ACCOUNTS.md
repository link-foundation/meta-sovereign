# Work accounts: initial support for issue #42

[Issue #42](https://github.com/link-foundation/meta-sovereign/issues/42) names Upwork, Fiverr, PeoplePerHour and Wellfound. All four have an initial **Work accounts** flow in **Connections** and **Profile**.

| Service       | Sign-in and profile support                                                 | Other integration                                                                                            |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Upwork        | Visible manual sign-in, persistent browser profile, saved identity snapshot | Existing API/archive adapters require separate provider access; this browser flow does not issue API tokens. |
| Fiverr        | Visible manual sign-in, persistent browser profile, saved identity snapshot | Messaging, orders and automated profile changes are future work.                                             |
| PeoplePerHour | Visible manual sign-in, persistent browser profile, saved identity snapshot | Existing API/archive adapters require separate provider access; this browser flow does not issue API tokens. |
| Wellfound     | Visible manual sign-in, persistent browser profile, saved identity snapshot | Job applications, messaging and automated profile changes are future work.                                   |

## Use it

1. Run the updated JavaScript server with `node js/bin/meta-sovereign.js serve`. The default app remains [GitHub Pages](https://link-foundation.github.io/meta-sovereign/); the localhost UI is optional.
2. Open **Connections → Work accounts**, choose a service and click **Open sign-in browser**. A visible browser opens on the computer running the server. Browser support uses the existing optional `browser-commander` and Playwright packages and a desktop browser.
3. Sign in yourself, including SSO, two-factor authentication or any service challenge. The app does not enter credentials or complete challenges.
4. Open your own profile in the **same tab**. Click **Save this profile** in meta-sovereign. A login page, a recognised challenge, an unrelated host or an unsupported profile URL is rejected rather than becoming a fake connected account.
5. The saved name, headline, biography, skills and profile link appear in both **Connections** and **Profile**. Fields not exposed by that page remain absent. **Show session window** brings an open session forward; **Close session window** closes it while retaining its browser profile.

A saved profile is a dated local snapshot, not proof of a current authenticated session. A dated sign-in observation is recorded only when a visible logout control was present. After a server restart the window is closed, the saved profile remains visible, and reopening uses the same browser profile and saved profile URL. The service can still require another sign-in when its session expires.

## Local data and request boundaries

Each service uses its own `<store>/browser-profiles/<service>` directory. These are app-owned profiles under the same OS user application folder as the server store, or the explicit `--store` override. No personal Safari/Chrome profile is scanned or copied by this flow. The default store locations are in [chat readiness and data storage](CHAT-READINESS.md).

The profile extractor reads named profile fields and public JSON-LD. It does not extract cookies, browser storage, passwords or tokens. The saved link is `account:marketplace:<service>` with whitelisted profile fields and capture dates; cookies remain in the browser profile. Profile URLs must be HTTPS URLs on the named service with an allowed profile path; query strings and fragments are discarded.

The server routes inherit the loopback, TLS, CORS, Host and passcode protections of the local server. Opening, reading and closing a session additionally require a trusted mutation origin. Request bodies must be empty objects: callers cannot supply credentials, launch flags, a profile directory or a URL.

| Route                                         | Purpose                                                               |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/marketplaces`                       | Four account summaries and saved profile snapshots; opens no browser. |
| `POST /api/marketplaces/<service>/open {}`    | Open one visible session, or focus the existing one.                  |
| `POST /api/marketplaces/<service>/profile {}` | Save profile fields from the current tab after explicit user action.  |
| `POST /api/marketplaces/<service>/close {}`   | Close this app-owned session; keep saved metadata and browser data.   |

## Verification and limits

The connection flow, profile parsing and persistence are tested with fixture pages in Chromium and WebKit. Tests cover all four services, login-page rejection, profile fields, cookie/storage/password access guards, window reuse, state after controller restart, mobile layout, foreign-origin rejection and rejection of supplied browser options. No personal account was used to claim a successful live sign-in.

The generic DOM selectors are initial, best-effort support rather than verified selectors for every authenticated site layout. If the site changes its profile page or adds a new profile URL, the window remains available for manual use; update the extractor/catalogue when profile capture no longer recognises it. This is initial login/profile support, not full completion of every potential integration in issue #42.

## Service references

- Upwork: [How to build your freelancer profile](https://support.upwork.com/hc/en-us/articles/360016252373-How-to-build-your-freelancer-profile-the-essentials).
- Fiverr: [Creating and editing your freelancer profile](https://help.fiverr.com/hc/en-us/articles/360010558598-Creating-editing-your-freelancer-profile).
- PeoplePerHour: [Account creation](https://support.peopleperhour.com/hc/en-us/articles/115016023568-Create-a-buyer-account).
- Wellfound: [Profiles and how to view them](https://help.wellfound.com/article/758-profiles).
