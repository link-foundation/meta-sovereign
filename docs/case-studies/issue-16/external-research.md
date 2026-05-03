# External research — issue #16

This file records the public-API research that informs the new probe
URL templates, the choice of credentials prompts, and the CORS posture
the SPA must expect from each provider. All findings were confirmed
against the providers' official documentation and reproduced with
`curl` from the development environment.

## 1. Telegram Bot API

- **Probe endpoint:** `getMe` is the canonical Bot API health check.
  It returns `{ ok: true, result: { id, is_bot, username, ... } }`
  when the token is valid, `401` when the token is bad, and `404`
  when the URL is malformed (no token segment).
- **URL shape:** `https://api.telegram.org/bot{token}/getMe`. The
  literal `bot` prefix is concatenated with the token, no slash. There
  is **no** tokenless health endpoint that returns 200; the smallest
  authenticated request is `getMe`.
- **CORS posture:** The Bot API responds with permissive CORS
  (`Access-Control-Allow-Origin: *`) for `GET` requests, so a probe
  from a browser succeeds without a proxy as long as the URL is well
  formed.
- **Credential prompt:** one `<input type="password">` named "Bot
  token", placeholder `123456:ABC-DEF...`. Stored as
  `secret:telegram:bot-token`.
- **Archive import:** Telegram Desktop → Settings → Advanced → Export
  Telegram data → JSON. The existing `parseArchive` in
  `js/src/sources/telegram.js` already accepts a `result.json` blob,
  so the Settings card needs only to wire `<input type="file">` →
  `text()` → `parseArchive`.

## 2. Meta Graph API (WhatsApp Cloud, Facebook Graph)

- **Probe endpoint:** `GET /v22.0/me?access_token={token}` is the
  Graph API "introspect the bearer" probe. Without `access_token`
  Meta returns `400` with `OAuthException 2500`. With an invalid
  token it returns `400` with `OAuthException 190 — Invalid OAuth
access token`. With a valid token it returns `{ id, name }` for the
  bound entity (user, page, system user, or WhatsApp business
  account).
- **URL shape:** `https://graph.facebook.com/v22.0/me?access_token={token}`.
  The version string `v22.0` is what the existing
  `whatsapp.js` source already pins.
- **CORS posture:** Meta's Graph API returns
  `Access-Control-Allow-Origin: *` for `GET` against `/me`, so the
  probe is browser-callable. Many `POST` endpoints (e.g. sending a
  WhatsApp message) require `Authorization: Bearer` and do **not** set
  CORS, but the probe is read-only and succeeds.
- **Credential prompt:**
  - **WhatsApp Cloud** — `<input type="password">` for "User access
    token / system-user token" (`secret:whatsapp:access-token`) and
    `<input type="text">` for "Phone number ID"
    (`secret:whatsapp:phone-number-id`). The phone number ID is not
    sensitive but is required for outbound `POST /{id}/messages` calls.
  - **Facebook Graph** — same `access_token` shape; stored as
    `secret:facebook:access-token`.
- **Archive import:** Facebook DYI export ships as a ZIP. The MVP for
  PR #17 accepts either a single JSON file from inside the export or
  a paste of a JSON snippet — full ZIP unpacking is a follow-up
  noted in `solution-plan.md`.

## 3. VK API

- **Probe endpoint:** `GET https://api.vk.com/method/users.get?v=5.199&access_token={token}`.
  Returns `{ response: [{ id, first_name, last_name }] }` on success
  and `{ error: { error_code, error_msg } }` on failure (still HTTP
  200). The probe must therefore inspect the JSON body, not just
  `response.ok`. The existing `tryDirect` already returns the parsed
  status; the probe runner adds the body inspection.
- **CORS posture:** VK responds with `Access-Control-Allow-Origin: *`.

## 4. X (Twitter) API v2

- **Probe endpoint:** `GET https://api.twitter.com/2/users/me` with
  `Authorization: Bearer {token}`.
- **CORS posture:** X **does not** set permissive CORS on `api.twitter.com`.
  The browser probe will fail with a TypeError → classified as `cors`
  by `tryDirect`, which is exactly the path that surfaces the local
  server help — no regression of the issue #10 contract.

## 5. LinkedIn API

- **Probe endpoint:** `GET https://api.linkedin.com/v2/me` with
  `Authorization: Bearer {token}`.
- **CORS posture:** LinkedIn does not allow browser CORS for
  `api.linkedin.com/v2`. Same outcome as X — probe gets a `cors`
  classification and the SPA points at the local proxy.

## 6. Job boards (career.habr.com, hh.ru, superjob)

- **HeadHunter (`hh.ru`):** `GET https://api.hh.ru/me` with
  `Authorization: Bearer {token}`. CORS permissive.
- **SuperJob:** `GET https://api.superjob.ru/2.0/user/current/` with
  `X-Api-App-Id` header. CORS not permissive — falls back to local
  server.
- **career.habr.com:** No public REST API; archive-import-only.
  Settings card exposes only the file upload and paste textarea.

## 7. CORS classification recap

The probe runner (`js/src/web/connection-guides.js → tryDirect`)
already differentiates:

| Outcome   | Cause                                                  | UI affordance                                                                        |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `ok`      | `fetch().ok === true`                                  | Green badge "Connected".                                                             |
| `http`    | `fetch().ok === false` with status (401/403/404/etc.). | Yellow badge "API responded with N" + provider-specific hint (e.g. "token expired"). |
| `cors`    | `TypeError` from `fetch` and target is cross-origin.   | Red badge + the existing `localServerHelp` block (issue #10's contract).             |
| `network` | Any other fetch rejection or no `globalThis.fetch`.    | Yellow badge "Network error" + retry button.                                         |

Issue #16 is fundamentally about ensuring the probe gets to one of
those four outcomes correctly — today it always lands on `http: 404` /
`http: 400` because the URL itself is wrong.

## 8. Persisted credential schema (links)

| Provider | Link id                           | Notes                                                                              |
| -------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| Telegram | `secret:telegram:bot-token`       | Bot token from BotFather.                                                          |
| WhatsApp | `secret:whatsapp:access-token`    | User or system-user token.                                                         |
| WhatsApp | `secret:whatsapp:phone-number-id` | Required for sending; non-sensitive but kept inside the secret store for symmetry. |
| Facebook | `secret:facebook:access-token`    | Page or user token.                                                                |
| VK       | `secret:vk:access-token`          | Implicit-flow access token.                                                        |
| X        | `secret:x:bearer-token`           | Bearer token from Twitter Developer Portal.                                        |
| LinkedIn | `secret:linkedin:access-token`    | OAuth 2.0 access token.                                                            |
| HH       | `secret:hh:access-token`          |                                                                                    |
| SuperJob | `secret:superjob:app-id`          | Header `X-Api-App-Id`.                                                             |

All link ids carry the `secret:` prefix so the existing
`wrapSecretStore` encrypts the `value` field and the existing peer
filters drop them on the wire.

## 9. End-to-end testing on GitHub Pages

The repository already builds a static SPA bundle to `dist/pages/` via
`scripts/build-pages.mjs` and publishes it via
`.github/workflows/pages.yml`. The new GitHub-Pages e2e job runs
**after** the Pages deploy step succeeds and uses Playwright to
navigate to the deployed URL (resolved from
`steps.deployment.outputs.page_url` so it works for branch deploys
too). The test only exercises read-only behaviour (page render +
no-credential probe), so it does not require any secret tokens.

The local e2e job uses Playwright against `http://127.0.0.1:<port>`
where the same `dist/pages/` bundle is served by `http-server` from
the existing `e2e-browser-spa.mjs` harness.

## 10. Library survey (no new runtime dependencies needed)

- **Form state.** The codebase already uses tiny vanilla React hooks
  (`useState`) and avoids form libraries. The Settings page follows
  the same pattern — no `react-hook-form`, no `formik`.
- **Encryption.** Already provided by `wrapSecretStore` (AES-256-GCM
  via Node `crypto.subtle`). No new crypto library.
- **File parsing.** Telegram JSON and WhatsApp `.txt` parsers already
  live under `js/src/sources/`. The Settings card calls them directly.
- **CORS detection.** Already provided by `tryDirect`.
- **Playwright.** Already a devDependency (used by the existing
  `e2e-browser-spa.mjs` smoke test).

The only additions are pure JS modules in `js/src/web/` and
`js/tests/`. No new third-party runtime code is introduced.
