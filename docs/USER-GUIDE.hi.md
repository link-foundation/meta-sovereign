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

अगर npm `404` देता है (package अभी npm पर नहीं है), तो वही server सीधे GitHub से चलाएँ:

```bash
npx -y github:link-foundation/meta-sovereign serve
```

## 4. desktop या mobile app install करें

Desktop और mobile apps GitHub Pages वाले उसी SPA को built-in server के साथ native shell में wrap करते हैं। खुद server start किए बिना पूरा app चाहिए तो इन्हें इस्तेमाल करें।

### Desktop (Linux, macOS, Windows)

<https://link-foundation.github.io/meta-sovereign/download/> खोलें। Page आपका system पहचानता है, newest release से matching installer देता है, और बाकी सभी builds की list दिखाता है। हर file [GitHub releases](https://github.com/link-foundation/meta-sovereign/releases) पर भी attached है।

| System  | Files (x64 और arm64)                                                       |
| ------- | -------------------------------------------------------------------------- |
| Linux   | `.AppImage` (खुद update होता है), `.deb`, `.tar.gz`                        |
| macOS   | `.dmg` (Applications में drag करें), `.zip`                                |
| Windows | `windows-installer` `.exe` (खुद update होता है), `windows-portable` `.exe` |

पहली बार चलाना:

- **macOS.** Apple Developer ID के बिना builds ad-hoc signed होते हैं, इसलिए macOS पहली launch रोकता है ("Apple could not verify…")। System Settings → Privacy & Security खोलें और **Open Anyway** click करें। ये builds खुद update नहीं होते; नए versions page से download करें।
- **Windows.** अगर SmartScreen "Windows protected your PC" दिखाए, तो **More info** → **Run anyway** click करें।
- **Linux.** `chmod +x meta-sovereign-desktop-linux-*.AppImage` करके चलाएँ, या `.deb` को `sudo apt install ./<file>.deb` से install करें।

Download की गई file को release के `SHA256SUMS.txt` से check करें: download page के **Verify your download** section में (file और `SHA256SUMS.txt` चुनें; कुछ भी browser से बाहर नहीं जाता) या terminal में:

```bash
sha256sum --check --ignore-missing SHA256SUMS.txt
gh attestation verify <file> --repo link-foundation/meta-sovereign
```

App अपना data system के per-user app folder में रखता है, इसलिए updates के बाद भी data रहता है। Installers खुद build करने के लिए: `npm i --no-save electron-builder@^26 && npm run desktop:build -- --linux --x64` (देखें `js/scripts/build-desktop.mjs`)।

### Mobile और development builds

| Platform | Build command                                      |
| -------- | -------------------------------------------------- |
| Electron | `npm run electron` (source tree से चलता है)        |
| iOS      | `npm run mobile:ios` (Xcode खोलता है)              |
| Android  | `npm run mobile:android` (Android Studio खोलता है) |

Electron और Capacitor shell `js/src/web/` को verbatim reuse करते हैं, इसलिए UI GitHub Pages app जैसा ही है।

## 5. SPA को server से जोड़ें

[`discoverServer()`](../js/src/web/discover.js) का क्रम:

1. **Same origin** — जब SPA सीधे JS/Rust server से serve हो।
2. **Saved override** — `localStorage.metaServer = "https://my-server"`; **Settings → Server** इसे set करता है।
3. **Runtime shell candidates** — Electron/Capacitor built-in server URL inject करते हैं।
4. **`127.0.0.1` ports** — default port automatic probe होता है।
5. **Caller-supplied LAN candidates** — programmatic list।

अगर कोई जवाब नहीं देता, SPA **offline mode** में local browser store में लिखता है। Server मिलने पर [`OfflineClient`](../js/src/web/client.js) queued writes replay करता है।

Offline mode में hosted app एक **browser-only mode** notice दिखाता है, जिसमें local server start करने के commands, **Check again** button और desktop app का link होता है। Imports, automations, sync, CV sync और greetings को server चाहिए। Contacts, patterns और broadcasts browser store से काम करते रहते हैं।

Hosted app `https://link-foundation.github.io` पर है, इसलिए browser पहले local server से permission माँगता है (CORS)। JS server default रूप से यह origin और Capacitor app allow करता है। किसी दूसरे origin को allow करने के लिए, जैसे SPA की आपकी अपनी copy:

```bash
meta-sovereign serve --allow-origin=https://example.org
# या: MS_ALLOW_ORIGINS="https://example.org https://link-foundation.github.io"
# --allow-origin=none cross-origin access बंद करता है
```

Browser notes:

- **Chrome और Edge** (और नए Firefox) एक बार पूछते हैं कि क्या page local network के devices तक पहुँच सकता है। Allow करें।
- **Safari** `https` pages को `http://127.0.0.1` तक नहीं पहुँचने देता। Server चलने पर <http://127.0.0.1:8787> सीधे खोलें, या desktop app इस्तेमाल करें।

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

## 10. hi या sticker से लोगों का अभिवादन करें

लोगों से बात करने में dialog शुरू करना ही सबसे धीमा हिस्सा है।
**अभिवादन** screen आपकी ओर से "hi" या greeting sticker भेजती है, ठीक
वैसे जैसे [konard/vk-bot](https://github.com/konard/vk-bot) VK पर करता
है, ताकि आप सीधे उस message पर पहुँच सकें जिसे आप सच में test करना
चाहते हैं।

1. **अभिवादन** खोलें। Sticker grid VK के greeting stickers (तस्वीरें
   सीधे vk.com से load होती हैं) और Messenger का thumbs-up दिखाती है।
   जिनसे अभिवादन करना है उन्हें tick करें।
2. अपने accounts से और stickers लाने के लिए **स्टिकर लाइव सूचीबद्ध करें**
   दबाएँ: VK stickers जिनके keywords अभिवादन हैं, और grid के नीचे listed
   Telegram sets के 👋 stickers। किसी set को उसके `t.me` link से Telegram
   में जोड़ा जा सकता है।
3. Greeting texts की भाषा चुनें और यह कि आप sticker पसंद करते हैं या
   text, फिर **चयन सहेजें**।
4. **योजना** को **नई बातचीत शुरू करें** (जिन लोगों को आपने कभी नहीं लिखा,
   सबसे पुराने पहले) या **अभिवादन का जवाब दें** (जिन्होंने "hi" कहा और
   इंतज़ार कर रहे हैं) पर set करें, फिर **योजना देखें**। Table दिखाती है
   कि किसे क्या मिलेगा, और किसी को skip क्यों किया गया — जैसे WhatsApp
   और Messenger free-form messages सिर्फ उस व्यक्ति के आखिरी message के
   24 घंटे के अंदर allow करते हैं, और Telegram bot सिर्फ जवाब दे सकता है।
5. **अभिवादन भेजें** plan को messages के बीच pause के साथ queue करता है
   (default 30 seconds)। किसी का अभिवादन दो बार नहीं होता।

यही terminal से:

```bash
meta-sovereign greetings-stickers --live --networks=vk,telegram
meta-sovereign greetings-select --stickers=vk:72789,vk:21 --language=ru
meta-sovereign greetings-plan --mode=initiate --limit=10
meta-sovereign greetings-send --mode=reply
```

Listing और sending के लिए JS server (`meta-sovereign serve`) और आपके
जुड़े हुए VK, Telegram, WhatsApp या Messenger accounts चाहिए। Server के
बिना भी screen catalogue और preview दिखाती है। खाली chats के लिए
Telegram के अपने सुझाव bots को उपलब्ध नहीं हैं — इसके और बाकी details के
लिए [`docs/GREETINGS.hi.md`](./GREETINGS.hi.md) देखें।

## 11. Automations: नियम के अनुसार, सुरक्षित तरीके से लोगों को संदेश भेजें

एक automation बताता है कि किसे, कब, किन शर्तों पर और कौन-सा text
भेजना है। उन्हें edit, preview और run करने के लिए **स्वचालन** tab
खोलें। पहला automation issue #31 का "Say hi to contacts silent for 90
days" है: हर निजी 1:1 chat, जिसमें कम से कम 90 दिन से कोई संदेश नहीं
है — groups, channels और bots शामिल नहीं होते — उसे एक संदेश मिलता है:

- अगर आप और वह व्यक्ति "ты" से बात करते थे तो "Привет … Тебе или твоим
  друзьям …", और "вы" से करते थे तो "Здравствуйте … Вам или вашим
  друзьям …"। रूप dialog से word-level rules द्वारा पहचाना जाता है;
  सबूत न हो या बराबरी हो तो विनम्र "вы" वाला text इस्तेमाल होता है।
  दोनों texts बदले जा सकते हैं, और उनमें `{name}`, `{days}` और
  `{network}` इस्तेमाल हो सकते हैं।
- बाकी presets खुली positions के बारे में पूछते हैं, contract work
  offer करते हैं, या hi कहने वाले को जवाब में hi कहते हैं। **नया
  ऑटोमेशन** एक खाली automation शुरू करता है।

हर automation में होता है:

- **कब चलता है**: हाथ से, chat के menu से, schedule पर (`30m`, `12h`,
  `1d`, `2w`) और/या किसी regular expression से मेल खाते आने वाले
  संदेश पर।
- **किसे**: एक audience — `personal`, `friends:vk`, `chat:vk:<id>`,
  `community:vk:<id>`, `list:<id>`, `audience:<id>` या `person:vk:<id>`,
  जिन्हें `|` (या), `&` (और), `-` (के सिवा) और brackets से जोड़ा जाता है,
  जैसे `friends:vk & chat:vk:2000000001 - list:blocked`।
- **शर्तें**: कम से कम N दिन से बात नहीं हुई, N दिन तक दोबारा नहीं,
  सिर्फ़ वे chats जिनमें आपने भी लिखा, सिर्फ़ निजी chats, आख़िरी संदेश
  किसका, कौन-से networks।
- **मोड**: **सुरक्षित** (safe, default) हर chat में एक draft छोड़ता है;
  **स्वचालित** (auto) एक बार आपसे पूछने के बाद typing indicator, random
  pauses और daily cap के साथ भेजता है।

**पूर्वावलोकन** बताता है कि किसे कौन-सा text मिलेगा और बाकी लोग क्यों
छूटे ("हाल ही में बात हुई", "एक मसौदा पहले से इंतज़ार में है", …); कुछ
भेजा नहीं जाता। Safe mode में हर draft अपने chat में दिखता है: उसे बदलें,
**भेजें** (click ही पुष्टि है), ты/вы बदलें, network में **चैट खोलें**,
**मैंने खुद भेज दिया**, या **छोड़ें**। हर नतीजा याद रखा जाता है, ताकि
वही व्यक्ति गलती से दो बार संदेश न पाए।

**लोग** सभी networks पर हर किसी को खोजता है (दूसरे networks पर वही
व्यक्ति cross references के रूप में दिखता है); लोगों को चुनकर automation
सिर्फ़ उन पर चलाएँ, या उन्हें list के रूप में सहेजें। **दर्शक** नाम वाले
specs सहेजता है और गिनता है कि वे कितने लोगों से मेल खाते हैं। किसी एक
व्यक्ति पर automation परखने के लिए उसका chat खोलें और **⚡ स्वचालन → इस
चैट में परखें** इस्तेमाल करें।

Chat खुद (**चैट** tab) लिखते समय जवाब सुझाता है: पहले वे पूरे जवाब जो
आपने chat के आख़िरी संदेश पर पहले दिए थे, सबसे ज़्यादा इस्तेमाल वाले
पहले, फिर आपके अपने संदेशों से शब्द-दर-शब्द; **Tab** पहला सुझाव लेता है।
यह दिखाता है कि सामने वाला — या आपकी ओर से कोई automation — कब लिख रहा
है। भेजना network की API से होता है, और वह न चले तो उसके official web UI
से। **सेटिंग्स → रूप-रंग** theme (system, light, dark, या दिन के समय के
अनुसार auto) और skin (t3.codes, Telegram, WhatsApp या Signal) चुनता है।

```bash
# सहेजे गए automations और presets
meta-sovereign automations
# किसे क्या मिलेगा, और बाकी क्यों छूटे — कुछ लिखा नहीं जाता
meta-sovereign automations plan reengage-dormant
# safe mode: हर व्यक्ति के लिए एक draft queue करें
meta-sovereign automations run reengage-dormant
# एक बार में एक draft — [y] भेजें, [m] खुद भेज दिया, [e] बदलें, [f] ты/вы बदलें, [s] छोड़ें, [q] बाहर
meta-sovereign automations review
# auto mode सिर्फ़ --confirm=true के साथ भेजता है; --chat चुने हुए chats तक सीमित करता है
meta-sovereign automations run job-search --chat=vk:101 --confirm=true
```

HTTP पर: `/api/automations` (list, सहेजने के लिए `PUT`),
`/api/automations/plan`, `/run`, `/drafts`,
`/drafts/{send,form,mark,skip}` और `/history`; `/api/people`,
`/api/audiences`, `/api/lists`, `/api/send`, `/api/typing` और
`/api/suggest`। पृष्ठभूमि:
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md)।

## 12. Troubleshooting

| Symptom                                                       | Fix                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SPA loading spinner पर अटका है।                               | Dev tools → Application → IndexedDB में `meta-sovereign` database देखें; storage disabled हो सकता है।                                                                                                  |
| SPA local server तक नहीं पहुँचता।                             | App में **Settings → Server** खोलकर exact URL paste करें।                                                                                                                                              |
| Server चल रहा है, फिर भी hosted app browser-only mode में है। | **Check again** click करें। Browser का local network prompt allow करें। Safari में <http://127.0.0.1:8787> खोलें। SPA खुद host करते हैं तो server को `--allow-origin=<आपका origin>` के साथ start करें। |
| Server `EADDRINUSE` report करता है।                           | `meta-sovereign serve --port=NNNN` या Rust `serve --port=NNNN` चलाएँ।                                                                                                                                  |
| WebRTC sync दो LANs के बीच रुकता है।                          | TURN server configure करें: [`docs/WEBRTC-TURN.hi.md`](./WEBRTC-TURN.hi.md)।                                                                                                                           |
| `cargo build` linker error देता है।                           | C toolchain install करें (`build-essential` या Xcode CLI tools)।                                                                                                                                       |

## 13. आगे कहाँ जाएँ

- [`README.hi.md`](../README.hi.md) — project overview और developer notes।
- [`docs/REQUIREMENTS.hi.md`](./REQUIREMENTS.hi.md) — canonical requirements।
- [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md) — JS vs. Rust routes।
- [`docs/CV-SYNC.hi.md`](./CV-SYNC.hi.md) — CV synchronisation कैसे काम करता है, platform दर platform।
- [`docs/GREETINGS.hi.md`](./GREETINGS.hi.md) — greeting stickers और texts, network दर network।
- [`docs/UI-DESIGN-AUDIT.hi.md`](./UI-DESIGN-AUDIT.hi.md) — accessibility और design audit।
- [`docs/case-studies/`](./case-studies/) — हर issue की case studies।
