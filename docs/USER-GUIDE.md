# User Guide (languages: en • [zh](USER-GUIDE.zh.md) • [hi](USER-GUIDE.hi.md) • [ru](USER-GUIDE.ru.md))

This page collects the user-facing flows for `meta-sovereign` in one
place. The flows are ordered from "install nothing" to "install
everything", so you can stop reading the moment you have what you need.

> **TL;DR:** Open <https://link-foundation.github.io/meta-sovereign/>.
> That's the whole web app. Optionally start a local Rust server (or
> the JS server) so the app can sync your data between devices.

## 1. Install nothing — open the web app

1. Open <https://link-foundation.github.io/meta-sovereign/> in any
   modern browser (Chrome, Firefox, Safari, Edge).
2. The app boots immediately. There is **no sign-up**, **no telemetry**,
   and **nothing leaves your browser** until you point it at a server.
3. Your data is kept in browser-local storage
   ([`createBrowserStore`](../js/src/storage/browser-store.js): IndexedDB
   first, then localStorage, then in-memory). You can already:
   - Browse and search the contacts you import.
   - Create chat patterns and reply variations.
   - Compose broadcasts and outreach plans.
   - Use the operator UI to triage chats.

If you only ever use one device, this is enough.

## 2. Add a local Rust server (preferred)

The Rust server is one binary, no runtime, fastest cold start. It
exposes the same wire protocol as the JS server (see
[`docs/SERVER-PARITY.md`](./SERVER-PARITY.md)).

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

The server listens on <http://127.0.0.1:8787> by default. The
GitHub-Pages-hosted SPA discovers it automatically: it probes the
saved override (`metaServer` in `localStorage`) and a short list of
`127.0.0.1` ports, exactly the way `discoverServer()` does in
`js/src/web/discover.js`.

If your browser does not auto-connect, open the in-app **Settings →
Server** prompt and paste the URL the Rust binary printed.

## 3. Add a local JS server (fallback)

Use this if you do not have a Rust toolchain handy, or if you want
the extra routes (`/api/backups`, `/api/export-encrypted`,
`/api/links/purge-tombstones`, `/api/outreach`) that the Rust server
has not yet caught up on (see
[`docs/SERVER-PARITY.md`](./SERVER-PARITY.md)).

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

…or with Bun:

```bash
bunx meta-sovereign serve
```

The JS server listens on the same port and speaks the same wire
protocol; the SPA does not care which one is on the other end.

## 4. Install the desktop or mobile app

The desktop and mobile apps wrap the **same** SPA you get from
GitHub Pages, plus a built-in server, in a native shell. Use them if
you want offline-only mode without a browser tab.

| Platform | Build command                                   |
| -------- | ----------------------------------------------- |
| Electron | `npm run electron`                              |
| iOS      | `npm run mobile:ios` (opens Xcode)              |
| Android  | `npm run mobile:android` (opens Android Studio) |

The Electron + Capacitor shells reuse `js/src/web/` verbatim, so the UI is
identical to the GitHub Pages app. The desktop shell additionally
enables the [`electron-updater`](https://www.npmjs.com/package/electron-updater)
auto-update flow when the optional peer dependency is installed.

## 5. Connect the SPA to your server

The web SPA uses
[`discoverServer()`](../js/src/web/discover.js) to pick a server. The
order is:

1. **Same origin** — useful when you serve the SPA from the JS or
   Rust server directly.
2. **Saved override** — `localStorage.metaServer = "https://my-server"`.
   The in-app **Settings → Server** prompt sets this for you.
3. **Runtime shell candidates** — Electron and Capacitor inject the
   built-in server URL.
4. **`127.0.0.1` ports** — the default Rust/JS server port is probed
   automatically.
5. **Caller-supplied LAN candidates** — you can pass a list to
   `discoverServer()` programmatically.

If none of those answer, the SPA stays in **offline mode** and writes
go to the local browser store. When a server appears later, the
[`OfflineClient`](../js/src/web/client.js) replays the queued writes.

## 6. Sync between your devices (WebRTC)

Once your devices share the same server (Rust or JS), they sync over
WebRTC via the server's `/rtc` signaling endpoint
([`webrtc-sync.js`](../js/src/web/webrtc-sync.js)). All traffic is
peer-to-peer; the server is only used for the initial handshake. See
[`docs/WEBRTC-TURN.md`](./WEBRTC-TURN.md) for using a TURN server when
peers are behind symmetric NAT.

## 7. Encrypted backup and export

Your data is encrypted at rest by default
([`vault.js`](../js/src/storage/vault.js), AES-256-GCM, master key + per-method
unlocks: passphrase, PIN, passkey, TOTP recovery code).

Export an encrypted snapshot from the CLI:

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

Or from a JS-server-backed SPA (`POST /api/export-encrypted`).

The Rust server does not yet expose `/api/export-encrypted`; use the
CLI in that case (it works against any backend because the encryption
runs locally).

## 8. Importing data

Drop archive files into `~/.meta-sovereign/imports/` (configurable)
and run:

```bash
meta-sovereign import
```

Supported sources: email (`.eml`/mbox), VK, Telegram (Desktop), X, WhatsApp,
Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru. See
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section E for the full
list and per-source notes.

For live email, use `source-pull --source=email --protocol=gmail`,
`microsoft-graph`, `jmap`, `imap`, or `pop3`. Raw IMAP/POP3/SMTP
protocols also need `--host`, plus `--username` and `--password` unless
the equivalent `EMAIL_*` environment variables are set.

## 9. Sync your CV across job platforms

Your CV usually lives on LinkedIn, hh.ru, Habr Career, Naukri,
VietnamWorks, TopCV and SuperJob at the same time, and the seven
copies drift apart. `meta-sovereign` reads all of them through a
browser running on your own machine, shows the differences, and writes
the agreed values back.

This needs the CLI: a web page cannot drive another web page, so the
**CV** screen in the app shows coverage, differences and run history
but hands live runs to the terminal.

```bash
# one-off: install the browser engine (optional dependency)
npm install playwright browser-commander
npx playwright install chromium

# what is supported, and how much of it is verified markup
meta-sovereign cv-platforms

# sign in once, with a visible browser; the session is remembered
meta-sovereign cv-read --platforms=linkedin --headed --profile=~/.meta-sovereign/cv

# read several profiles, keeping page snapshots for later inspection
meta-sovereign cv-read --platforms=linkedin,hh,naukri --login=<your-login> --artifacts=./cv-runs

# compare what was read — no browser involved
meta-sovereign cv-diff --prefer=linkedin

# see what a sync would change, then do it
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# write one field, or one editor section, and nothing else
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# what happened during the last runs
meta-sovereign cv-telemetry --type=step.miss
```

You are never asked for a platform password: the browser opens with
`--headed`, you sign in the way you normally would, and the session
stays in the profile directory you passed.

The same operations are available over HTTP when a local server is
running: `GET /api/cv/platforms`, `GET /api/cv/plan?platform=…`,
`GET /api/cv/stored`, `POST /api/cv/read`, `POST /api/cv/compare`,
`POST /api/cv/sync`, `GET /api/cv/telemetry`.

| Symptom                                  | What it means                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `browser-commander is not installed`     | Install the optional dependencies above, or use `cv-platforms` / `cv-plan` / `cv-diff`, which never open a browser.  |
| A run stops with `login-required`        | The platform bounced you to its login page. Re-run with `--headed` and sign in.                                      |
| A run stops with `step-missed`           | The site changed its markup. The reason names the selector; `cv-telemetry` and the `--artifacts` HTML show the page. |
| A platform reports `unsupported` changes | That field has no editor in the platform's plan — the change is reported instead of being silently dropped.          |
| A field is listed as `deselected`        | It is writable, but your `--paths`/`--groups` filter left it out.                                                    |

Details — the canonical CV shape, the step vocabulary, the telemetry
events, and what is verified per platform — are in
[`docs/CV-SYNC.md`](./CV-SYNC.md).

## 10. Troubleshooting

| Symptom                                  | Fix                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SPA is stuck on a loading spinner.   | Open dev tools → Application → IndexedDB and confirm a `meta-sovereign` database exists; if not, your browser may have third-party storage disabled. |
| The SPA cannot reach my local server.    | Open **Settings → Server** in the app and paste the exact URL. The discovery path falls back to a saved override.                                    |
| The server reports `EADDRINUSE`.         | Pass `--port=NNNN` to `meta-sovereign serve` or `cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve --port=NNNN`.           |
| WebRTC sync stops between two LANs.      | Configure a TURN server — see [`docs/WEBRTC-TURN.md`](./WEBRTC-TURN.md).                                                                             |
| `cargo build` fails with `linker` error. | Install a C toolchain (`build-essential` on Debian/Ubuntu, Xcode CLI tools on macOS).                                                                |

## 11. Where to go next

- [`README.md`](../README.md) — project overview and developer notes.
- [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) — canonical requirement
  list.
- [`docs/SERVER-PARITY.md`](./SERVER-PARITY.md) — JS vs. Rust server
  routes.
- [`docs/CV-SYNC.md`](./CV-SYNC.md) — how CV synchronisation works,
  platform by platform.
- [`docs/UI-DESIGN-AUDIT.md`](./UI-DESIGN-AUDIT.md) — accessibility +
  HIG/Material/Fluent compliance audit.
- [`docs/case-studies/`](./case-studies/) — full case studies for
  every issue, including the issue-#8 case study covering this
  publishing setup.
