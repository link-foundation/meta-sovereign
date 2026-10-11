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

## 9. Job platforms के बीच CV sync करें

CV अक्सर एक साथ LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks,
TopCV और SuperJob पर रहता है, और ये सातों copies अलग-अलग होती चली जाती
हैं। `meta-sovereign` इन सबको आपकी अपनी machine के browser से पढ़ता है,
अंतर दिखाता है और तय किए गए values वापस लिख देता है।

इसके लिए CLI चाहिए: एक web page दूसरी web page को drive नहीं कर सकती,
इसलिए app का **CV** screen coverage, differences और run history दिखाता
है, जबकि live runs terminal को सौंप देता है।

```bash
# एक बार: browser engine install करें (optional dependency)
npm install playwright browser-commander
npx playwright install chromium

# क्या-क्या supported है और कितना markup verified है
meta-sovereign cv-platforms

# एक बार दिखने वाले browser में sign in करें; session profile में रहती है
meta-sovereign cv-read --platforms=linkedin --headed --profile=~/.meta-sovereign/cv

# कई profiles पढ़ें और page snapshots रखें
meta-sovereign cv-read --platforms=linkedin,hh,naukri --login=<आपका-login> --artifacts=./cv-runs

# जो पढ़ा गया उसकी तुलना करें — browser की जरूरत नहीं
meta-sovereign cv-diff --prefer=linkedin

# पहले देखें कि sync क्या बदलेगा, फिर चलाएँ
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# सिर्फ एक field या एक editor section लिखें, और कुछ नहीं
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# पिछले runs में क्या हुआ
meta-sovereign cv-telemetry --type=step.miss
```

Platform password कभी नहीं पूछा जाता: browser `--headed` के साथ खुलता है,
आप हमेशा की तरह sign in करते हैं, और session आपके दिए profile directory
में रहती है।

Local server चलने पर यही operations HTTP से भी उपलब्ध हैं:
`GET /api/cv/platforms`, `GET /api/cv/plan?platform=…`,
`GET /api/cv/stored`, `POST /api/cv/read`, `POST /api/cv/compare`,
`POST /api/cv/sync`, `GET /api/cv/telemetry`।

| Symptom                              | इसका मतलब                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `browser-commander is not installed` | ऊपर दी optional dependencies install करें, या `cv-platforms` / `cv-plan` / `cv-diff` इस्तेमाल करें — वे browser नहीं खोलते। |
| Run `login-required` पर रुका         | Platform ने login page पर भेज दिया। `--headed` के साथ दोबारा चलाकर sign in करें।                                            |
| Run `step-missed` पर रुका            | Site ने markup बदल दिया। कारण में selector लिखा है; `cv-telemetry` और `--artifacts` का HTML page दिखाते हैं।                |
| Platform `unsupported` बताता है      | उस field के लिए platform के plan में editor नहीं है — change चुपचाप गिराया नहीं जाता, report होता है।                       |
| Field `deselected` दिखता है          | वह writable है, पर आपके `--paths`/`--groups` filter ने उसे छोड़ दिया।                                                       |
| CV screen कहता है JS server चाहिए    | जुड़ा हुआ backend (जैसे Rust server) `/api/cv/*` routes नहीं देता।                                                          |

Canonical CV shape, step vocabulary, telemetry events और हर platform पर
क्या verified है — यह सब
[`docs/CV-SYNC.hi.md`](./CV-SYNC.hi.md) में है।

## 10. जिनसे लंबे समय से बात नहीं हुई, उनसे फिर से जुड़ें

**फिर से जुड़ें** screen (और `reengage` command) उन सभी निजी 1:1 chats
को दिखाता है जिनमें कम से कम 90 दिन से कोई संदेश नहीं है — groups,
channels और bots शामिल नहीं होते — और हर संपर्क के लिए एक संदेश तैयार
करता है:

- अगर आप और वह व्यक्ति "ты" से बात करते थे तो "Привет … Тебе или твоим
  друзьям …", और "вы" से करते थे तो "Здравствуйте … Вам или вашим
  друзьям …"। रूप dialog से word-level rules द्वारा पहचाना जाता है; card
  सबूत दिखाता है, और **… पर बदलें** उसे पलट देता है। सबूत न हो या
  बराबरी हो तो विनम्र "вы" वाला text इस्तेमाल होता है।
- **Safe mode default रूप से चालू है**: एक बार में एक pre-filled संदेश
  दिखता है, आप उसे बदल सकते हैं, और वह सिर्फ़ **भेजें** दबाने पर जाता
  है। **मैंने खुद भेज दिया** हाथ से भेजे संदेश को दर्ज करता है (**चैट
  खोलें** / **कॉपी करें** मदद करते हैं), **छोड़ें** अगले पर ले जाता है।
- Safe mode बंद करने पर **सभी भेजें** दिखता है, जो बाकी संदेश भेजने से
  पहले एक बार फिर पूछता है।

हर भेजना, हाथ से भेजना, छोड़ना और विफलता याद रखी जाती है, ताकि वही
व्यक्ति तब तक दोबारा न दिखे जब तक सीमा फिर से पार न हो। App से भेजने के
लिए उस network से जुड़ा local server चाहिए; उसके बिना कॉपी / चैट खोलें
और **मैंने खुद भेज दिया** इस्तेमाल करें।

```bash
# who has been silent for 90+ days, which form was detected, what would be sent
meta-sovereign reengage
meta-sovereign reengage --days=180 --networks=telegram,vk

# safe (debug) mode: एक बार में एक draft — [y] भेजें, [m] खुद भेज दिया, [e] बदलें, [f] ты/вы बदलें, [s] छोड़ें, [q] बाहर
meta-sovereign reengage --interactive

# बिना पूछे सब भेजें
meta-sovereign reengage --mode=batch --confirm=true
```

अपने texts: `--informal="Привет, {name}!\n\n…"`, `--formal="…"`, या
`informal` और `formal` keys वाली `--templates=texts.json`। `{name}` की
जगह संपर्क का नाम आता है। HTTP पर: `POST /api/reengage/plan`, `/send`,
`/mark` और `/run`। पृष्ठभूमि:
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md)।

## 11. Troubleshooting

| Symptom                              | Fix                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| SPA loading spinner पर अटका है।      | Dev tools → Application → IndexedDB में `meta-sovereign` database देखें; storage disabled हो सकता है। |
| SPA local server तक नहीं पहुँचता।    | App में **Settings → Server** खोलकर exact URL paste करें।                                             |
| Server `EADDRINUSE` report करता है।  | `meta-sovereign serve --port=NNNN` या Rust `serve --port=NNNN` चलाएँ।                                 |
| WebRTC sync दो LANs के बीच रुकता है। | TURN server configure करें: [`docs/WEBRTC-TURN.hi.md`](./WEBRTC-TURN.hi.md)।                          |
| `cargo build` linker error देता है।  | C toolchain install करें (`build-essential` या Xcode CLI tools)।                                      |

## 12. आगे कहाँ जाएँ

- [`README.hi.md`](../README.hi.md) — project overview और developer notes।
- [`docs/REQUIREMENTS.hi.md`](./REQUIREMENTS.hi.md) — canonical requirements।
- [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md) — JS vs. Rust routes।
- [`docs/CV-SYNC.hi.md`](./CV-SYNC.hi.md) — CV synchronisation कैसे काम करता है, platform दर platform।
- [`docs/UI-DESIGN-AUDIT.hi.md`](./UI-DESIGN-AUDIT.hi.md) — accessibility और design audit।
- [`docs/case-studies/`](./case-studies/) — हर issue की case studies।
