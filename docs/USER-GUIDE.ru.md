# Руководство пользователя (languages: [en](USER-GUIDE.md) • [zh](USER-GUIDE.zh.md) • [hi](USER-GUIDE.hi.md) • ru)

Эта страница собирает пользовательские сценарии `meta-sovereign` в одном месте. Они упорядочены от “ничего не устанавливать” до “установить все”, чтобы можно было остановиться сразу после нужного варианта.

> **TL;DR:** откройте <https://link-foundation.github.io/meta-sovereign/>. Это все web-приложение. При необходимости запустите локальный Rust server или JS server, чтобы синхронизировать данные между устройствами.

## 1. Ничего не устанавливать — открыть web app

1. Откройте <https://link-foundation.github.io/meta-sovereign/> в Chrome, Firefox, Safari или Edge.
2. App запускается сразу. Нет sign-up, нет telemetry, и данные не выходят из браузера, пока вы не укажете server.
3. Данные хранятся в browser-local storage ([`createBrowserStore`](../js/src/storage/browser-store.js): IndexedDB → localStorage → memory). Уже можно:
   - просматривать и искать импортированные contacts;
   - создавать chat patterns и reply variations;
   - собирать broadcasts и outreach plans;
   - triage чатов через operator UI.

Если вы используете один device, этого достаточно.

## 2. Добавить локальный Rust server (preferred)

Rust server — один binary без runtime и с самым быстрым cold start. Он exposes тот же wire protocol, что и JS server (см. [`docs/SERVER-PARITY.ru.md`](./SERVER-PARITY.ru.md)).

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

Server слушает <http://127.0.0.1:8787> по умолчанию. SPA на GitHub Pages найдет его автоматически через saved override (`metaServer` в `localStorage`) и список портов `127.0.0.1`.

Если browser не подключился, откройте **Settings → Server** и вставьте URL, который напечатал Rust binary.

## 3. Добавить локальный JS server (fallback)

Используйте этот вариант, если нет Rust toolchain или нужны routes, которые Rust server еще не догнал: `/api/backups`, `/api/export-encrypted`, `/api/links/purge-tombstones`, `/api/outreach`.

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

Или через Bun:

```bash
bunx meta-sovereign serve
```

JS server слушает тот же port и говорит тем же wire protocol; SPA не важно, какой backend на другой стороне.

## 4. Установить desktop или mobile app

Desktop и mobile apps заворачивают тот же SPA с GitHub Pages и встроенный server в native shell. Используйте их, если нужен offline-only mode без вкладки браузера.

| Platform | Build command                                       |
| -------- | --------------------------------------------------- |
| Electron | `npm run electron`                                  |
| iOS      | `npm run mobile:ios` (открывает Xcode)              |
| Android  | `npm run mobile:android` (открывает Android Studio) |

Electron и Capacitor shell переиспользуют `js/src/web/` без изменений. Desktop shell также включает `electron-updater`, если optional peer dependency установлена.

## 5. Подключить SPA к server

[`discoverServer()`](../js/src/web/discover.js) выбирает server так:

1. **Same origin** — когда SPA отдается прямо JS или Rust server.
2. **Saved override** — `localStorage.metaServer = "https://my-server"`, задается через **Settings → Server**.
3. **Runtime shell candidates** — Electron и Capacitor inject URL встроенного server.
4. **Порты `127.0.0.1`** — default server port probe-ится автоматически.
5. **Caller-supplied LAN candidates** — список передается программно.

Если ничего не отвечает, SPA остается в **offline mode** и пишет в local browser store. Когда server появляется позже, [`OfflineClient`](../js/src/web/client.js) replay-ит queued writes.

## 6. Sync между устройствами (WebRTC)

Когда устройства используют один server (Rust или JS), они sync-ятся через WebRTC и server endpoint `/rtc` ([`webrtc-sync.js`](../js/src/web/webrtc-sync.js)). Трафик peer-to-peer; server нужен только для initial handshake. Для symmetric NAT см. [`docs/WEBRTC-TURN.ru.md`](./WEBRTC-TURN.ru.md).

## 7. Encrypted backup and export

Данные encrypted-at-rest by default ([`vault.js`](../js/src/storage/vault.js), AES-256-GCM, master key + passphrase/PIN/passkey/TOTP unlocks).

Экспорт encrypted snapshot из CLI:

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

Также доступен `POST /api/export-encrypted` из SPA, подключенного к JS server. Rust server пока не exposes этот route; в этом случае используйте CLI.

## 8. Import данных

Положите archive files в `~/.meta-sovereign/imports/` (configurable) и выполните:

```bash
meta-sovereign import
```

Supported sources: email (`.eml`/mbox), VK, Telegram Desktop, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru. Полный список — в [`docs/REQUIREMENTS.ru.md`](./REQUIREMENTS.ru.md), section E.

Для live email используйте `source-pull --source=email --protocol=gmail`, `microsoft-graph`, `jmap`, `imap` или `pop3`. Raw IMAP/POP3/SMTP требуют `--host`, `--username`, `--password`, если не заданы эквивалентные `EMAIL_*` env vars.

## 9. Troubleshooting

| Symptom                               | Fix                                                                                                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SPA завис на loading spinner.         | Dev tools → Application → IndexedDB: проверьте database `meta-sovereign`; возможно, storage disabled. |
| SPA не видит local server.            | В app откройте **Settings → Server** и вставьте точный URL.                                           |
| Server сообщает `EADDRINUSE`.         | Передайте `--port=NNNN` в `meta-sovereign serve` или Rust `serve --port=NNNN`.                        |
| WebRTC sync ломается между двумя LAN. | Настройте TURN server: [`docs/WEBRTC-TURN.ru.md`](./WEBRTC-TURN.ru.md).                               |
| `cargo build` падает с linker error.  | Установите C toolchain (`build-essential` на Debian/Ubuntu, Xcode CLI tools на macOS).                |

## 10. Дальше

- [`README.ru.md`](../README.ru.md) — overview проекта и developer notes.
- [`docs/REQUIREMENTS.ru.md`](./REQUIREMENTS.ru.md) — canonical requirements.
- [`docs/SERVER-PARITY.ru.md`](./SERVER-PARITY.ru.md) — JS vs. Rust routes.
- [`docs/UI-DESIGN-AUDIT.ru.md`](./UI-DESIGN-AUDIT.ru.md) — accessibility и design audit.
- [`docs/case-studies/`](./case-studies/) — case studies по каждому issue.
