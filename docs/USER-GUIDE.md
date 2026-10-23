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

## 2. Add a local Rust server (lightweight, limited)

The Rust server is one binary, no runtime, fastest cold start. It
exposes the same wire protocol as the JS server (see
[`docs/SERVER-PARITY.md`](./SERVER-PARITY.md)).

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

> **Know the limits before you choose it.** The Rust server keeps links **in memory only**: nothing is written to disk, so all data is gone when it stops. It has **no source adapters**: no live fetches from Telegram, VK, GitHub, Upwork and the like, no outbound HTTP or TLS client (email only ingests archives), and no automations, CV sync, browser auto-import, backups or `/api/export-encrypted`. For real use pick the JS server (section 3) or the desktop app (section 4). The route-by-route list is in [`docs/SERVER-PARITY.md`](./SERVER-PARITY.md).

The server listens on <http://127.0.0.1:8787> by default. The
GitHub-Pages-hosted SPA discovers it automatically: it probes the
saved override (`metaServer` in `localStorage`) and a short list of
`127.0.0.1` ports, exactly the way `discoverServer()` does in
`js/src/web/discover.js`.

If your browser does not auto-connect, open the in-app **Settings →
Server** prompt and paste the URL the Rust binary printed.

## 3. Add a local JS server (full feature set)

Use this if you do not have a Rust toolchain handy, or if you want
the extra routes (`/api/backups`, `/api/export-encrypted`,
`/api/links/purge-tombstones`, `/api/outreach`) that the Rust server
has not yet caught up on (see
[`docs/SERVER-PARITY.md`](./SERVER-PARITY.md)).

The package is **not published on npm yet** (the registry answers 404), so run the server from a source checkout (needs Node.js and npm):

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
npm install
node js/bin/meta-sovereign.js serve
```

The JS server listens on the same port and speaks the same wire protocol; the SPA does not care which one is on the other end.

Once the package is published to npm, `npx -y meta-sovereign serve` (or `npm install -g meta-sovereign && meta-sovereign serve`) will work; until then neither does.

## 4. Install the desktop or mobile app

The desktop and mobile apps wrap the **same** SPA you get from
GitHub Pages, plus a built-in server, in a native shell. Use them if
you want the full app without starting a server yourself.

### Desktop (Linux, macOS, Windows)

Open <https://link-foundation.github.io/meta-sovereign/download/>. The
page detects your system, offers the matching installer from the
newest release, and lists every other build. Each file is also
attached to the [GitHub releases](https://github.com/link-foundation/meta-sovereign/releases).

| System  | Files (x64 and arm64)                                                |
| ------- | -------------------------------------------------------------------- |
| Linux   | `.AppImage` (auto-updates), `.deb`, `.tar.gz`                        |
| macOS   | `.dmg` (drag to Applications), `.zip`                                |
| Windows | `windows-installer` `.exe` (auto-updates), `windows-portable` `.exe` |

First launch:

- **macOS.** Builds without an Apple Developer ID are ad-hoc signed,
  so macOS blocks the first launch ("Apple could not verify…"). Go to
  System Settings → Privacy & Security and click **Open Anyway**. These
  builds do not auto-update; download new versions from the page.
- **Windows.** If SmartScreen shows "Windows protected your PC",
  click **More info** → **Run anyway**.
- **Linux.** `chmod +x meta-sovereign-desktop-linux-*.AppImage` and run
  it, or install the `.deb` with `sudo apt install ./<file>.deb`.

Check a download against the release's `SHA256SUMS.txt`, either in
the download page's **Verify your download** section (pick the file
and `SHA256SUMS.txt`; nothing leaves the browser) or in a terminal:

```bash
sha256sum --check --ignore-missing SHA256SUMS.txt
gh attestation verify <file> --repo link-foundation/meta-sovereign
```

The app keeps its data in the system's per-user app folder, so it
survives updates. To build the installers yourself:
`npm i --no-save electron-builder@^26 && npm run desktop:build -- --linux --x64`
(see `js/scripts/build-desktop.mjs`).

### Mobile and development builds

| Platform | Build command                                   |
| -------- | ----------------------------------------------- |
| Electron | `npm run electron` (runs from the source tree)  |
| iOS      | `npm run mobile:ios` (opens Xcode)              |
| Android  | `npm run mobile:android` (opens Android Studio) |

The Electron + Capacitor shells reuse `js/src/web/` verbatim, so the UI is
identical to the GitHub Pages app.

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

In offline mode the hosted app shows a **browser-only mode** notice
with the commands to start a local server, a **Check again** button,
and a link to the desktop app. Imports, automations, sync, CV sync and
greetings need the server. Contacts, patterns and broadcasts keep
working from the browser store.

The hosted app lives on `https://link-foundation.github.io`, so the
browser asks the local server for permission first (CORS). The JS
server allows that origin and the Capacitor app by default. To allow
another origin, for example your own copy of the SPA:

```bash
meta-sovereign serve --allow-origin=https://example.org
# or: MS_ALLOW_ORIGINS="https://example.org https://link-foundation.github.io"
# --allow-origin=none turns cross-origin access off
```

The hosted app is the default UI. `serve` prints its address, the app
finds the server on port 8787 by itself, and the server's own copy at <http://127.0.0.1:8787>
stays as a fallback (Safari, no internet). To stop serving it:

```bash
meta-sovereign serve --local-ui=false   # or MS_LOCAL_UI=off
# / now opens the hosted app; --ui-url=<url> names another hosted copy
meta-sovereign serve --tls=false        # or MS_TLS=off — turns HTTPS off
```

Browser notes:

- **Chrome and Edge** (and newer Firefox) ask once whether the page may
  reach devices on your local network. Allow it.
- **Safari** does not let `https` pages reach `http://127.0.0.1`, but the
  server also answers HTTPS on the same port with a self-signed certificate
  for localhost. Trust it once to let the hosted app connect directly: run
  `node js/bin/meta-sovereign.js trust` (macOS adds the certificate to the login
  keychain; on other systems it prints the certificate path), or open
  `https://127.0.0.1:8787/trust` in Safari, click **Show Details → visit
  this website** and enter your password, then click **Check again**. After
  that, the hosted app in Safari connects over HTTPS without extra steps.
  Before trusting, the notice links **Open the app from the server**
  (<http://127.0.0.1:8787>) and **Trust the server**
  (<https://127.0.0.1:8787/trust>). `--tls=false` / `MS_TLS=off` turns
  HTTPS off; the server's own copy stays as a fallback.

## 6. Sync between your devices (WebRTC)

Once your devices share the same server (Rust or JS), they sync over
WebRTC via the server's `/rtc` signaling endpoint
([`webrtc-sync.js`](../js/src/web/webrtc-sync.js)). All traffic is
peer-to-peer; the server is only used for the initial handshake. See
[`docs/WEBRTC-TURN.md`](./WEBRTC-TURN.md) for using a TURN server when
peers are behind symmetric NAT.

## 7. Encrypted backup and export

Encrypted backups and exports use AES-256-GCM. The message store is **not** encrypted at rest; only saved credentials (`secret:*` links) can be, and only when the server starts with `MS_SECRET_PASSPHRASE` set (see [Protecting stored secrets](#protecting-stored-secrets) below). The `vault-*` CLI commands ([`vault.js`](../js/src/storage/vault.js)) manage a separate unlock file; the server does not use it.

**Files and backups.** Keep the store folder private (the app creates its files 0600 and folders 0700, and tightens older ones on start). A plain backup leaves secrets out (manifest `secrets: excluded`) and says so; an encrypted backup (type a passphrase on the Backup page, or set the variable) includes them. Logs hide tokens and passwords. One process writes a store at a time: a second writer (for example `import` while `serve` runs) stops with a clear message, while read-only commands such as `export` still work.

**Automatic backup and audience sync (environment variables).** The server can run two jobs by itself, started only once it really owns the port, stopped when it closes, and never started twice after a restart. Both log only counts, never message text or secrets.

| Variable                   | Default         | Meaning                                                                                                                                          |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MS_BACKUP_INTERVAL_HOURS` | unset = **off** | Hours between automatic backups into the `archives` folder (the first one a full interval after start). `0` or unset: no automatic backup.       |
| `MS_BACKUP_KEEP`           | `7`             | How many automatic backups to keep; the oldest are removed. `0` keeps all of them.                                                               |
| `MS_AUDIENCE_SYNC_HOURS`   | `24`            | Hours between refreshes of the saved audiences (friends and chat members) from the networks. `0`: off (the Sync button on the page still works). |

A value that is not a number of 0 or more is ignored: the default applies and one line is logged (`backup_setting_ignored` or `audience_sync_setting_ignored`); the server still starts.

Export an encrypted snapshot from the CLI:

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

Or from a JS-server-backed SPA (`POST /api/export-encrypted`).

The Rust server does not yet expose `/api/export-encrypted`; use the
CLI in that case (it works against any backend because the encryption
runs locally).

### Protecting stored secrets

Credentials you save in the app (the Telegram API id and hash, bot tokens, the Telegram user session, email tokens, and the GitHub, Upwork and PeoplePerHour tokens) are stored as links whose id starts with `secret:`. By default they sit in the store **in plain text**. To encrypt them, start the JS server with a passphrase in the `MS_SECRET_PASSPHRASE` environment variable:

```bash
MS_SECRET_PASSPHRASE='a long passphrase only you know' node js/bin/meta-sovereign.js serve
```

What it does:

- Every `secret:*` link is sealed with AES-256-GCM (key derived from the passphrase with scrypt, fresh salt and IV on every write) before it is written. The link id stays readable, so the store shows _which_ secrets exist, not their contents.
- Use the same passphrase on every start. A wrong passphrase cannot open the sealed secrets, and there is no recovery: if you lose the passphrase you lose those secrets and must sign in or paste the tokens again.
- Secrets saved before you set the passphrase stay in plain text until they are saved again.
- With the variable unset, nothing is encrypted and the server behaves as before.
- The same passphrase is the default for `POST /api/export-encrypted` when the request brings none.

What it does **not** encrypt: the rest of the store (`data.lino` and `data.bin`: contacts, messages, patterns and so on), downloaded media and archives, logs, and backups (a backup is encrypted only when you give a passphrase while creating it). Protect those with disk encryption and file permissions. The Rust server has no such option: it keeps everything in memory.

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

### Import with a browser

Every service card in **Connections** offers two separate ways to
connect: **Import with browser** (recommended) and **Enter manually**
(API keys, an export file or pasted contents). The service page shows
them as two tabs, and its address (`#conn-<service>` or
`#conn-<service>/manual`) keeps the open tab across reloads.
**Import with browser**
needs the JS server (`meta-sovereign serve`, Node.js 22.12 or newer)
on the same computer;
the server drives Chrome through
[browser-commander](https://github.com/link-foundation/browser-commander).

1. Press **Open browser**. The service opens in a separate Chrome window
   with its own profile (`<store>/auto-import/profiles/<service>`,
   owner-only access), so you sign in only once.
2. Start the service's data export there. Every file that window
   downloads is captured; ZIP and tar.gz archives are unpacked and the
   export files inside are imported.
3. Telegram Web and WhatsApp Web have no export: open a chat and press
   **Capture this chat**.
4. Press **Finish** or close the window. An idle browser closes itself
   after 30 minutes.

**Use your browser sign-ins (recommended).** At the top of
**Connections**, **Find sign-ins** lists every browser on the computer
(Chrome, Safari, Firefox, Edge, Brave, Arc, Yandex and others) and the
services each one is signed in to. Only site names are read for this.
**Use these sign-ins** then copies those services' cookies from the
browsers you ticked into an owner-only file
(`<store>/auto-import/sign-ins/<service>.json`); the next import window
for that service opens signed in and the copy is deleted. Your browsers
are only read and nothing leaves the computer. Telegram Web and
WhatsApp Web keep their sign-in outside cookies, so scan their QR code
once. On macOS Safari's data needs **Full Disk Access**: the panel names
the app to allow (your terminal, or the desktop app) and opens System
Settings → Privacy & Security → Full Disk Access; restart the server
afterwards. Chrome may ask for your Keychain password once.

Services are listed by how many people use them, biggest first, so
Email comes first.

**Find Telegram sessions on this computer.** If you have experimented with
Telegram across several repositories, your sign-ins are already on this
machine — a bot token in one project's `.env`, a GramJS user _string
session_ (saved as `.telegram_session`) beside another. On
**Connections → Telegram → Enter manually**, **Find my Telegram sessions**
walks your project folders (`~/Code`, `~/projects`, … and the current
directory), collects both **bot tokens** and **user sessions**, and groups
them by the account each belongs to — so the same account found in three
repositories shows as one. Bot tokens are confirmed with Telegram's
`getMe`; user sessions are grouped by their phone (and confirmed too when a
GramJS client is available). The folders are only read; the browser only
ever sees the kind, the path and a masked hint (last four characters) —
never the token or session. Picking one stores it under
`secret:telegram:*` (encrypted at rest when a passphrase is set) and never
sends it anywhere but Telegram.

**Log in with your Telegram account (phone).** Below the finder, "Log in
with your Telegram account" signs in like Telegram Desktop — the same way
konard/telegram-bot does: enter your `api_id`, `api_hash` and phone number,
press **Send code**, type the code Telegram sends you (and your 2FA
password if you set one), and the resulting user session is saved under
`secret:telegram:*`. Both bot tokens and full user accounts are supported.
The sign-in runs on the local server (GramJS); a discovered
`.telegram_session` is verified against the real account when GramJS is
installed, so it is grouped by `@username` rather than just by phone.

**Email login and password.** Email → Enter manually accepts an IMAP/SMTP
server, your login (email address) and a password or app password, stored
as `secret:email:host` / `secret:email:username` / `secret:email:password`,
in addition to the OAuth token — so mailboxes that use password auth work
without an OAuth flow.

**Mail connection and security (R-Z5).** The server reads these saved fields
(`secret:email:*`: host, port, security, username, password, mailbox, `ca`)
for every pull and send. On the Email card, "Fetch mail now" pulls new mail
(at most once every 15 seconds); a poller also pulls every 10 minutes once a
mailbox is connected, and only new mail is fetched. `secure: false` now means
STARTTLS is required: the connection is upgraded and its certificate is
verified before the password is sent, and a server that cannot do it is
refused. Plain text is allowed only for `127.0.0.1` (for example Proton
Bridge). Certificates are always verified; to trust a private certificate
save its CA in `ca`. A saved password is never sent to a different host than
the one it was saved for. If you used `secure: false` against a real server
before, it used to travel in clear text or fail; it now uses STARTTLS. Mail
is shown from a sanitised copy: scripts, remote pictures and tracking pixels
are removed, and attachments are downloads only. Not yet: an OAuth sign-in
screen, a protocol field and a folder picker.

The server needs permission to start a browser process and to write to
its store directory. Optional settings:

| Variable                                       | Effect                                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MS_BROWSER_CDP_URL`                           | Attach to a running Chrome (`chrome --remote-debugging-port=9222`, then `http://127.0.0.1:9222`). Use it with Docker, where there is no screen. |
| `MS_BROWSER_CHANNEL` / `MS_BROWSER_EXECUTABLE` | Use another Chromium-based browser.                                                                                                             |
| `MS_BROWSER_HEADLESS=1`                        | No window (only for profiles that are already signed in).                                                                                       |
| `MS_BROWSER_VERBOSE=1`                         | browser-commander debug logs.                                                                                                                   |

Under Deno start the server with `deno task serve`; it grants
`--allow-run` for the browser process. Auto-import can only be started
from the app itself: the server rejects requests from other websites.

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

## 10. Greet people with a hi or a sticker

Opening a dialog is the slow part of talking to people. The
**Greetings** screen sends a "hi" or a greeting sticker for you,
the way [konard/vk-bot](https://github.com/konard/vk-bot) does on VK,
so you can get to the message you actually want to test.

1. Open **Greetings**. The sticker grid shows VK's greeting stickers
   (pictures load straight from vk.com) and Messenger's thumbs-up. Tick
   the ones you want to greet with.
2. Press **List stickers live** to fetch more from your accounts: VK
   stickers whose keywords are greetings, and the 👋 stickers from the
   Telegram sets listed under the grid. You can add a set to Telegram
   from its `t.me` link.
3. Pick the language for greeting texts and whether you prefer a
   sticker or text, then **Save selection**.
4. Set **Plan** to **start new dialogs** (people you have never written
   to, oldest first) or **answer greetings** (people who said "hi" and
   are waiting), then **Preview plan**. The table shows who gets what, and why someone is
   skipped — for example, WhatsApp and Messenger only allow free-form
   messages within 24 hours of the person's last message, and a Telegram
   bot can only answer.
5. **Send greetings** queues the plan with a pause between messages (30 seconds by
   default). Nobody is greeted twice.

The same from a terminal:

```bash
meta-sovereign greetings-stickers --live --networks=vk,telegram
meta-sovereign greetings-select --stickers=vk:72789,vk:21 --language=ru
meta-sovereign greetings-plan --mode=initiate --limit=10
meta-sovereign greetings-send --mode=reply
```

Listing and sending need the JS server (`meta-sovereign serve`) and
your connected VK, Telegram, WhatsApp or Messenger accounts. Without a
server the screen still shows the catalogue and the preview. Telegram's
own suggestions for empty chats are not available to bots — see
[`docs/GREETINGS.md`](./GREETINGS.md) for this and the other details.

## 11. Automations: message people by rule, safely

An automation says who to message, when, on what conditions and with
which text. Open the **Automation** tab to edit, preview and run them.
The first one is issue #31's "Say hi to contacts silent for 90 days":
every personal 1:1 chat with no messages for at least 90 days — groups,
channels and bots are left out — gets one message:

- "Привет … Тебе или твоим друзьям …" when you and that person used
  "ты", and "Здравствуйте … Вам или вашим друзьям …" when you used
  "вы". The form is detected from the dialog with word-level rules;
  with no evidence, or a tie, the polite "вы" text is used. Both texts
  are editable, with `{name}`, `{days}` and `{network}`.
- Other presets ask about open positions, offer contract work, or greet
  back someone who says hi. **New automation** starts an empty one.

Each automation has:

- **When it runs**: by hand, from a chat's menu, on a schedule
  (`30m`, `12h`, `1d`, `2w`) and/or on an incoming message matching a
  regular expression.
- **Who**: an audience — `personal`, `friends:vk`, `chat:vk:<id>`,
  `community:vk:<id>`, `list:<id>`, `audience:<id>` or `person:vk:<id>`,
  joined with `|` (or), `&` (and), `-` (except) and brackets, e.g.
  `friends:vk & chat:vk:2000000001 - list:blocked`.
- **Conditions**: silent for at least N days, not again for N days,
  only chats where you wrote too, only personal chats, who wrote last,
  which networks.
- **Mode**: **safe** (default) leaves a draft in each chat; **auto**
  sends with a typing indicator, random pauses and a daily cap, after
  asking you once.

**Preview** lists who would get which text and why the rest are left
out ("talked recently", "a draft is already waiting", …); nothing is
sent. In safe mode every draft appears in its chat: edit it, **Send**
(the click is the confirmation), switch ты/вы, **Open chat** in the
network, **I sent it myself**, or **Skip**. Every outcome is
remembered, so the same person is not messaged twice by accident.

**People** searches everyone across networks (with the same person on
other networks shown as cross references); select people to run an
automation on just them, or save them as a list. **Audiences** saves
named specs and counts who they match. To test an automation on one
person, open their chat and use **⚡ Automations → Test in this chat**.

The chat itself (**Chat** tab) suggests replies while you type: first
the whole replies you gave before to the chat's last message, most used
first, then word by word from your own messages; **Tab** takes the
first suggestion. With nothing typed it offers only a typical reply — one
you gave that message at least twice — and nothing for a message long
past answering. Suggestions come from a copy of your reply history kept
in the browser, so they show as you type, also after a reload or with
the server away; the server adds rarer ones when you pause. It shows when the other person — or an automation on
your behalf — is typing. Sending uses the network's API and falls back
to its official web UI. **Settings → Appearance** picks the theme
(system, light, dark, or auto by the time of day) and the skin (t3.codes,
Telegram, WhatsApp or Signal).

Messages work as in Telegram Desktop. Right-click a message (or press
and hold it on a phone) for its menu, opened where you clicked: its
reactions, then **Reply** (**Quote & Reply** when part of its text is
selected: the reply quotes that part), **Copy Selected Text**, **Edit**,
**Pin**/**Unpin**, **Save As…** and **Copy Image** on a photo, **Copy
Text**, **Copy Link** on a link or else **Copy Message Link** (**Copy
Post Link** in a channel), **Forward**, **Delete** and **Select**. In a
group an incoming message shows **Reply** at its corner under the
pointer. Double-click a message (or swipe it to the left on a phone) to
reply; double-tap reacts with 👍. To select messages, drag from one
message to another (a drag that starts on a selected one takes them
away) or choose **Select**; then a click adds or takes one and
Shift+click a range, up to 100. The chat's top bar then shows **Forward
n**, **Delete n** and **Cancel**. Right-click a selected message for
**Copy Selected as Text**, **Forward Selected**, **Delete Selected**,
**Unpin Selected** and **Clear Selection**, or another one for **Select
up to this message**. Several messages are copied as Telegram Desktop
copies them, each as "[date time] Name: text". **Esc** ends selecting,
**Ctrl/Cmd+C** copies and **Delete** deletes. In an empty composer **↑**
edits your last message, and **Ctrl/Cmd+↑/↓** choose the message to
reply to.

The chat list is Telegram's: pinned chats first, in their order, with a
pin; a muted chat's count in grey; archived chats behind one **Archived
Chats** row; and each row says who wrote last and what ("🙂 Sticker",
"Photo", with the picture). A chat read on another device keeps the
count Telegram says is still unread.

```bash
# saved automations and presets
meta-sovereign automations
# who would get what, and why the rest are left out — nothing is written
meta-sovereign automations plan reengage-dormant
# safe mode: queue one draft per person
meta-sovereign automations run reengage-dormant
# one draft at a time — [y] send, [m] I sent it myself, [e] edit, [f] switch ты/вы, [s] skip, [q] quit
meta-sovereign automations review
# auto mode sends only with --confirm=true; --chat narrows to chosen chats
meta-sovereign automations run job-search --chat=vk:101 --confirm=true
```

Over HTTP: `/api/automations` (list, `PUT` to save), `/api/automations/plan`,
`/run`, `/drafts`, `/drafts/{send,form,mark,skip}` and `/history`;
`/api/people`, `/api/audiences`, `/api/lists`, `/api/send`,
`/api/typing`, `/api/suggest` and `/api/suggest/model` (the reply index
as links, `?format=lino` for Links Notation, `?since=` for what changed). Background:
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md).

**Nothing is sent without you.** Reading — importing, pulling new
messages, previewing — happens whenever needed. Anything that writes to
another service or that other people would see (a message, a post, a
greeting, an outreach batch, a profile or CV update) is shown first and
sent only after you confirm exactly that: the Send button under the
text you typed, the Send button on a draft, or a confirmation that
lists what will go out. Schedules and incoming-message triggers only
prepare drafts, even in auto mode. Saving your profile or CV keeps it on
this device; **Update other services** on the Profile screen publishes it
to the networks you tick. "Typing…" is shared only when you turn it on in
**Settings → Privacy**. On the command line, sending commands show the
plan and ask y/N; scripts pass `--yes`.

## 12. Troubleshooting

| Symptom                                                                | Fix                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SPA is stuck on a loading spinner.                                 | Open dev tools → Application → IndexedDB and confirm a `meta-sovereign` database exists; if not, your browser may have third-party storage disabled.                                                                                                                                                                                                                                                                      |
| The SPA cannot reach my local server.                                  | Open **Settings → Server** in the app and paste the exact URL. The discovery path falls back to a saved override.                                                                                                                                                                                                                                                                                                         |
| The hosted app stays in browser-only mode while the server runs.       | Click **Check again**. Allow the browser's local network prompt. On Safari: run `node js/bin/meta-sovereign.js trust` once (macOS) or open **Trust the server** (<https://127.0.0.1:8787/trust>), click Show Details → visit this website, then **Check again**. Or click **Open the app from the server** (<http://127.0.0.1:8787>). If you host the SPA yourself, start the server with `--allow-origin=<your origin>`. |
| Photos and avatars show as initials or empty frames in the hosted app. | Update the server: the page asks for pictures as CORS requests, which the server lets through for the app's own origins only. If you host the SPA yourself, add its origin with `--allow-origin`. Refused loads appear in the log as `telegram_media_refused` (which page asked and how), loads that failed in the page as `client_media_failed` (counts by route).                                                       |
| Some messages or avatars are missing right after a reload.             | Wait a few seconds: the chat asks for its messages again until they come, and a photo still downloading from Telegram shows once it is saved (the first time, Telegram sends each one slowly). Saved photos load at once afterwards.                                                                                                                                                                                      |
| The server reports `EADDRINUSE`.                                       | Pass `--port=NNNN` to `meta-sovereign serve` or `cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve --port=NNNN`.                                                                                                                                                                                                                                                                                |
| WebRTC sync stops between two LANs.                                    | Configure a TURN server — see [`docs/WEBRTC-TURN.md`](./WEBRTC-TURN.md).                                                                                                                                                                                                                                                                                                                                                  |
| `cargo build` fails with `linker` error.                               | Install a C toolchain (`build-essential` on Debian/Ubuntu, Xcode CLI tools on macOS).                                                                                                                                                                                                                                                                                                                                     |

## 13. Where to go next

- [`README.md`](../README.md) — project overview and developer notes.
- [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) — canonical requirement
  list.
- [`docs/SERVER-PARITY.md`](./SERVER-PARITY.md) — JS vs. Rust server
  routes.
- [`docs/CV-SYNC.md`](./CV-SYNC.md) — how CV synchronisation works,
  platform by platform.
- [`docs/GREETINGS.md`](./GREETINGS.md) — greeting stickers and texts,
  network by network.
- [`docs/UI-DESIGN-AUDIT.md`](./UI-DESIGN-AUDIT.md) — accessibility +
  HIG/Material/Fluent compliance audit.
- [`docs/case-studies/`](./case-studies/) — full case studies for
  every issue, including the issue-#8 case study covering this
  publishing setup.
