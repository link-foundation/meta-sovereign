# उपयोगकर्ता मार्गदर्शिका (languages: [en](USER-GUIDE.md) • [zh](USER-GUIDE.zh.md) • hi • [ru](USER-GUIDE.ru.md))

यह पेज `meta-sovereign` की user-facing flows को एक जगह रखता है। क्रम “कुछ भी install नहीं” से “सब कुछ install” तक है, ताकि जरूरत पूरी होते ही आप रुक सकें।

> **TL;DR:** <https://link-foundation.github.io/meta-sovereign/> खोलें। यही पूरा web app है। Data को devices के बीच sync करने के लिए optional local Rust server या JS server start करें।

## 1. कुछ install न करें — web app खोलें

1. Chrome, Firefox, Safari या Edge में <https://link-foundation.github.io/meta-sovereign/> खोलें।
2. App तुरंत boot होता है। कोई sign-up नहीं, कोई telemetry नहीं, और server बताने तक data browser से बाहर नहीं जाता।
3. Data browser-local storage में रहता है ([`createBrowserStore`](../js/src/storage/browser-store.js): IndexedDB → localStorage → memory)। आप:
   - imported contacts browse/search कर सकते हैं;
   - chat patterns और reply variations बना सकते हैं;
   - broadcasts और outreach plans compose कर सकते हैं;
   - operator UI से chats triage कर सकते हैं।

अगर आप एक ही device इस्तेमाल करते हैं, इतना काफी है।

## 2. local Rust server जोड़ें (preferred)

Rust server single binary है, runtime नहीं चाहिए, और cold start सबसे तेज है। यह JS server जैसा ही wire protocol expose करता है (देखें [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md))।

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

Server default रूप से <http://127.0.0.1:8787> पर listen करता है। GitHub Pages वाला SPA saved override (`localStorage` में `metaServer`) और `127.0.0.1` ports probe करके इसे खोजता है।

यदि browser auto-connect नहीं करता, app में **Settings → Server** खोलें और Rust binary का printed URL paste करें।

## 3. local JS server जोड़ें (fallback)

Rust toolchain न हो, या `/api/backups`, `/api/export-encrypted`, `/api/links/purge-tombstones`, `/api/outreach` जैसे extra routes चाहिए हों, तो JS server इस्तेमाल करें।

```bash
npm install -g meta-sovereign
meta-sovereign serve
```

या Bun से:

```bash
bunx meta-sovereign serve
```

JS server वही port और wire protocol बोलता है; SPA के लिए backend type मायने नहीं रखता।

## 4. desktop या mobile app install करें

Desktop और mobile apps GitHub Pages वाले उसी SPA को built-in server के साथ native shell में wrap करते हैं। Browser tab के बिना offline mode चाहिए तो इन्हें इस्तेमाल करें।

| Platform | Build command                                      |
| -------- | -------------------------------------------------- |
| Electron | `npm run electron`                                 |
| iOS      | `npm run mobile:ios` (Xcode खोलता है)              |
| Android  | `npm run mobile:android` (Android Studio खोलता है) |

Electron और Capacitor shell `js/src/web/` को verbatim reuse करते हैं। Optional peer dependency install होने पर desktop shell `electron-updater` auto-update भी enable करता है।

## 5. SPA को server से जोड़ें

[`discoverServer()`](../js/src/web/discover.js) का क्रम:

1. **Same origin** — जब SPA सीधे JS/Rust server से serve हो।
2. **Saved override** — `localStorage.metaServer = "https://my-server"`; **Settings → Server** इसे set करता है।
3. **Runtime shell candidates** — Electron/Capacitor built-in server URL inject करते हैं।
4. **`127.0.0.1` ports** — default port automatic probe होता है।
5. **Caller-supplied LAN candidates** — programmatic list।

अगर कोई जवाब नहीं देता, SPA **offline mode** में local browser store में लिखता है। Server मिलने पर [`OfflineClient`](../js/src/web/client.js) queued writes replay करता है।

## 6. devices के बीच sync (WebRTC)

जब devices एक ही server share करते हैं, वे `/rtc` signaling endpoint से WebRTC sync करते हैं ([`webrtc-sync.js`](../js/src/web/webrtc-sync.js))। Traffic peer-to-peer होता है; server सिर्फ handshake के लिए है। Symmetric NAT के लिए [`docs/WEBRTC-TURN.hi.md`](./WEBRTC-TURN.hi.md) देखें।

## 7. encrypted backup और export

Data default रूप से encrypted-at-rest है ([`vault.js`](../js/src/storage/vault.js), AES-256-GCM, master key और passphrase/PIN/passkey/TOTP unlocks)।

CLI से encrypted snapshot export करें:

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

JS-server-backed SPA से `POST /api/export-encrypted` भी उपलब्ध है। Rust server यह route अभी expose नहीं करता; उस स्थिति में CLI इस्तेमाल करें।

## 8. data import

Archive files `~/.meta-sovereign/imports/` में रखें और चलाएँ:

```bash
meta-sovereign import
```

Supported sources: email (`.eml`/mbox), VK, Telegram Desktop, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru। पूरी list [`docs/REQUIREMENTS.hi.md`](./REQUIREMENTS.hi.md) section E में है।

Live email के लिए `source-pull --source=email --protocol=gmail`, `microsoft-graph`, `jmap`, `imap` या `pop3` इस्तेमाल करें। Raw IMAP/POP3/SMTP में `--host`, `--username`, `--password` भी चाहिए, जब तक equivalent `EMAIL_*` env vars set न हों।

## 9. Troubleshooting

| Symptom                              | Fix                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| SPA loading spinner पर अटका है।      | Dev tools → Application → IndexedDB में `meta-sovereign` database देखें; storage disabled हो सकता है। |
| SPA local server तक नहीं पहुँचता।    | App में **Settings → Server** खोलकर exact URL paste करें।                                             |
| Server `EADDRINUSE` report करता है।  | `meta-sovereign serve --port=NNNN` या Rust `serve --port=NNNN` चलाएँ।                                 |
| WebRTC sync दो LANs के बीच रुकता है। | TURN server configure करें: [`docs/WEBRTC-TURN.hi.md`](./WEBRTC-TURN.hi.md)।                          |
| `cargo build` linker error देता है।  | C toolchain install करें (`build-essential` या Xcode CLI tools)।                                      |

## 10. आगे कहाँ जाएँ

- [`README.hi.md`](../README.hi.md) — project overview और developer notes।
- [`docs/REQUIREMENTS.hi.md`](./REQUIREMENTS.hi.md) — canonical requirements।
- [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md) — JS vs. Rust routes।
- [`docs/UI-DESIGN-AUDIT.hi.md`](./UI-DESIGN-AUDIT.hi.md) — accessibility और design audit।
- [`docs/case-studies/`](./case-studies/) — हर issue की case studies।
