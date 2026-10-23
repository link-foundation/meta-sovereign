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

## 2. local Rust server जोड़ें (हल्का, सीमित)

Rust server single binary है, runtime नहीं चाहिए, और cold start सबसे तेज है। यह JS server जैसा ही wire protocol expose करता है (देखें [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md))।

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

> **चुनने से पहले सीमाएँ जान लें।** Rust server links को **सिर्फ़ memory में** रखता है: disk पर कुछ नहीं लिखा जाता, बंद होते ही सारा data चला जाता है। इसमें **कोई source adapters नहीं हैं**: Telegram, VK, GitHub, Upwork आदि से live fetch नहीं, outbound HTTP/TLS client नहीं (email सिर्फ़ archives ingest करता है), और automations, CV sync, browser auto-import, backups तथा `/api/export-encrypted` नहीं हैं। असली इस्तेमाल के लिए JS server (section 3) या desktop app (section 4) चुनें। Route-by-route सूची [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md) में है।

Server default रूप से <http://127.0.0.1:8787> पर listen करता है। GitHub Pages वाला SPA saved override (`localStorage` में `metaServer`) और `127.0.0.1` ports probe करके इसे खोजता है।

यदि browser auto-connect नहीं करता, app में **Settings → Server** खोलें और Rust binary का printed URL paste करें।

## 3. local JS server जोड़ें (पूरा feature set)

Rust toolchain न हो, या `/api/backups`, `/api/export-encrypted`, `/api/links/purge-tombstones`, `/api/outreach` जैसे extra routes चाहिए हों, तो JS server इस्तेमाल करें।

Package अभी **npm पर publish नहीं है** (registry 404 देती है), इसलिए server को source checkout से चलाएँ (Node.js और npm चाहिए):

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
npm install
node js/bin/meta-sovereign.js serve
```

JS server उसी port पर listen करता है और वही wire protocol बोलता है; SPA को फ़र्क़ नहीं पड़ता कि दूसरी तरफ़ कौन-सा backend है।

Package npm पर publish होने के बाद `npx -y meta-sovereign serve` (या `npm install -g meta-sovereign && meta-sovereign serve`) काम करेगा; तब तक दोनों में से कोई नहीं करता।

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

Default UI hosted app है। `serve` उसका पता छापता
है, app port 8787 पर server को खुद ढूँढ लेता है, और <http://127.0.0.1:8787> पर server की अपनी copy fallback रहती है
(Safari, internet नहीं)। उसे serve करना बंद करने के लिए:

```bash
meta-sovereign serve --local-ui=false   # या MS_LOCAL_UI=off
# अब / hosted app खोलता है; --ui-url=<url> कोई दूसरी hosted copy बताता है
meta-sovereign serve --tls=false        # या MS_TLS=off — HTTPS बंद करता है
```

Browser notes:

- **Chrome और Edge** (और नए Firefox) एक बार पूछते हैं कि क्या page local network के devices तक पहुँच सकता है। Allow करें।
- **Safari** `https` pages को `http://127.0.0.1` तक नहीं पहुँचने देता, लेकिन `https://127.0.0.1` तक पहुँचने देता है; server उसी port पर HTTPS का भी जवाब देता है और localhost के लिए self-signed certificate बनाता है। Hosted app को Safari में सीधे connect कराने के लिए certificate एक बार trust करें: `node js/bin/meta-sovereign.js trust` चलाएँ (macOS login keychain में add करता है; दूसरे systems पर certificate का path print होता है), या Safari में `https://127.0.0.1:8787/trust` खोलें, **Show Details → visit this website** click करें और password डालें, फिर **Check again** click करें। उसके बाद hosted app Safari में बिना extra steps के HTTPS से connect हो जाता है। Trust से पहले notice **सर्वर से ऐप खोलें** (<http://127.0.0.1:8787>) और **सर्वर पर भरोसा करें** (<https://127.0.0.1:8787/trust>) दोनों का link देता है। `--tls=false` / `MS_TLS=off` HTTPS बंद करता है; server की अपनी copy fallback रहती है।

## 6. devices के बीच sync (WebRTC)

जब devices एक ही server share करते हैं, वे `/rtc` signaling endpoint से WebRTC sync करते हैं ([`webrtc-sync.js`](../js/src/web/webrtc-sync.js))। Traffic peer-to-peer होता है; server सिर्फ handshake के लिए है। Symmetric NAT के लिए [`docs/WEBRTC-TURN.hi.md`](./WEBRTC-TURN.hi.md) देखें।

## 7. encrypted backup और export

एन्क्रिप्टेड बैकअप और export AES-256-GCM इस्तेमाल करते हैं। Message store disk पर **encrypted नहीं** है; सिर्फ़ saved credentials (`secret:*` लिंक) encrypt हो सकते हैं, और तभी जब सर्वर `MS_SECRET_PASSPHRASE` के साथ शुरू हो (नीचे [सहेजे गए secrets की सुरक्षा](#सहेजे-गए-secrets-की-सुरक्षा) देखें)। `vault-*` CLI commands ([`vault.js`](../js/src/storage/vault.js)) एक अलग unlock file सँभालते हैं; server उसे इस्तेमाल नहीं करता।

**फ़ाइलें और बैकअप।** स्टोर फ़ोल्डर निजी रखें (ऐप फ़ाइलें 0600 और फ़ोल्डर 0700 से बनाता है, और शुरू होने पर पुरानों को सख़्त करता है)। सामान्य बैकअप secrets छोड़ देता है (manifest `secrets: excluded`) और यह बताता है; एन्क्रिप्टेड बैकअप (Backup पेज पर पासफ़्रेज़ लिखें या वेरिएबल सेट करें) उन्हें शामिल करता है। लॉग में टोकन और पासवर्ड छिपे रहते हैं। एक समय में एक ही प्रक्रिया स्टोर में लिखती है: दूसरा लेखक (जैसे `serve` चलते समय `import`) स्पष्ट संदेश के साथ रुकता है, जबकि `export` जैसे केवल-पढ़ने वाले कमांड चलते हैं।

CLI से encrypted snapshot export करें:

```bash
meta-sovereign export-encrypted --file=backup.lino.gcm --passphrase='…'
```

JS-server-backed SPA से `POST /api/export-encrypted` भी उपलब्ध है। Rust server यह route अभी expose नहीं करता; उस स्थिति में CLI इस्तेमाल करें।

### सहेजे गए secrets की सुरक्षा

App में आपके सहेजे credentials (Telegram API id और hash, bot tokens, Telegram user session, email tokens, और GitHub, Upwork तथा PeoplePerHour tokens) ऐसे links के रूप में रखे जाते हैं जिनका id `secret:` से शुरू होता है। Default रूप से वे store में **plain text** में रहते हैं। उन्हें encrypt करने के लिए JS server को `MS_SECRET_PASSPHRASE` environment variable में passphrase के साथ start करें:

```bash
MS_SECRET_PASSPHRASE='सिर्फ़ आपको पता लंबा passphrase' node js/bin/meta-sovereign.js serve
```

यह क्या करता है:

- हर `secret:*` link लिखने से पहले AES-256-GCM से seal होता है (key passphrase से scrypt द्वारा बनती है, हर write पर नया salt और IV)। Link id पढ़ने योग्य रहता है, इसलिए store दिखाता है कि _कौन-से_ secrets हैं, उनकी सामग्री नहीं।
- हर start पर वही passphrase इस्तेमाल करें। ग़लत passphrase से sealed secrets नहीं खुलते और recovery नहीं है: passphrase खो देने पर वे secrets खो जाते हैं और आपको दोबारा sign in करना या tokens paste करना होगा।
- Passphrase सेट करने से पहले सहेजे गए secrets दोबारा save होने तक plain text में रहते हैं।
- Variable सेट न हो तो कुछ encrypt नहीं होता और server पहले जैसा चलता है।
- अगर request passphrase नहीं देता, तो `POST /api/export-encrypted` में यही passphrase default है।

यह क्या encrypt **नहीं** करता: store का बाकी हिस्सा (`data.lino` और `data.bin`: contacts, messages, patterns आदि), download किया media और archives, logs, और backups (backup तभी encrypted होता है जब बनाते समय आप passphrase दें)। इन्हें disk encryption और file permissions से सुरक्षित करें। Rust server में ऐसा option नहीं है: वह सब कुछ memory में रखता है।

## 8. data import

Archive files `~/.meta-sovereign/imports/` में रखें और चलाएँ:

```bash
meta-sovereign import
```

Supported sources: email (`.eml`/mbox), VK, Telegram Desktop, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru। पूरी list [`docs/REQUIREMENTS.hi.md`](./REQUIREMENTS.hi.md) section E में है।

Live email के लिए `source-pull --source=email --protocol=gmail`, `microsoft-graph`, `jmap`, `imap` या `pop3` इस्तेमाल करें। Raw IMAP/POP3/SMTP में `--host`, `--username`, `--password` भी चाहिए, जब तक equivalent `EMAIL_*` env vars set न हों।

### ब्राउज़र से आयात

**कनेक्शन** में हर सेवा के कार्ड पर जोड़ने के दो अलग तरीके हैं:
**ब्राउज़र से आयात करें** (अनुशंसित) और **हाथ से दर्ज करें** (API कुंजियाँ,
एक्सपोर्ट फ़ाइल या चिपकाई गई सामग्री)। सेवा के पेज पर ये दो टैब हैं, और
उसका पता (`#conn-<service>` या `#conn-<service>/manual`) रीलोड के बाद भी
खुला टैब याद रखता है। **ब्राउज़र से आयात करें** के लिए उसी कंप्यूटर पर JS server (`meta-sovereign serve`, Node.js 22.12
या नया) चाहिए; server
[browser-commander](https://github.com/link-foundation/browser-commander)
से Chrome चलाता है।

1. **ब्राउज़र खोलें** दबाएँ। सेवा अपनी profile
   (`<store>/auto-import/profiles/<service>`, केवल owner की पहुँच) वाली
   अलग Chrome विंडो में खुलती है, इसलिए साइन इन एक ही बार करना होता है।
2. वहाँ सेवा का डेटा एक्सपोर्ट शुरू करें। उस विंडो में डाउनलोड हुई हर
   फ़ाइल पकड़ी जाती है; ZIP और tar.gz खोले जाते हैं और एक्सपोर्ट फ़ाइलें
   आयात होती हैं।
3. Telegram Web और WhatsApp Web में एक्सपोर्ट नहीं है: कोई चैट खोलें और
   **यह चैट सहेजें** दबाएँ।
4. **समाप्त** दबाएँ या विंडो बंद करें। निष्क्रिय ब्राउज़र 30 मिनट बाद
   अपने आप बंद हो जाता है।

**अपने ब्राउज़र के साइन-इन इस्तेमाल करें (अनुशंसित)।** **कनेक्शन**
में सबसे ऊपर **साइन-इन खोजें** इस कंप्यूटर के हर ब्राउज़र (Chrome,
Safari, Firefox, Edge, Brave, Arc, Yandex और दूसरे) और उनमें साइन-इन
सेवाओं की सूची दिखाता है। इसके लिए सिर्फ़ साइटों के नाम पढ़े जाते हैं।
**ये साइन-इन इस्तेमाल करें** चुने गए ब्राउज़र से उन सेवाओं की cookies
एक ऐसी फ़ाइल में कॉपी करता है जिसे सिर्फ़ मालिक पढ़ सकता है
(`<store>/auto-import/sign-ins/<service>.json`); उस सेवा की अगली आयात
विंडो साइन इन के साथ खुलती है और कॉपी मिटा दी जाती है। आपके ब्राउज़र
सिर्फ़ पढ़े जाते हैं और कुछ भी कंप्यूटर से बाहर नहीं जाता। Telegram Web
और WhatsApp Web साइन-इन cookies में नहीं रखते, इसलिए उनका QR कोड एक
बार स्कैन करें। macOS पर Safari के डेटा के लिए **Full Disk Access**
चाहिए: पैनल बताता है कि किस ऐप को अनुमति देनी है (आपका टर्मिनल या
डेस्कटॉप ऐप) और System Settings → Privacy & Security → Full Disk Access
खोलता है; इसके बाद सर्वर दोबारा शुरू करें। Chrome एक बार Keychain
पासवर्ड माँग सकता है।

सेवाएँ उपयोगकर्ताओं की संख्या के क्रम में हैं, सबसे बड़ी पहले, इसलिए
Email सबसे ऊपर है।

server को browser process शुरू करने और store directory में लिखने की
अनुमति चाहिए। वैकल्पिक settings:

| Variable                                       | असर                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `MS_BROWSER_CDP_URL`                           | चल रहे Chrome से जुड़ें (`chrome --remote-debugging-port=9222`, फिर `http://127.0.0.1:9222`)। Docker के लिए, जहाँ स्क्रीन नहीं होती। |
| `MS_BROWSER_CHANNEL` / `MS_BROWSER_EXECUTABLE` | कोई दूसरा Chromium-आधारित ब्राउज़र।                                                                                                  |
| `MS_BROWSER_HEADLESS=1`                        | बिना विंडो (केवल उन profiles के लिए जिनमें पहले से साइन इन है)।                                                                      |
| `MS_BROWSER_VERBOSE=1`                         | browser-commander debug logs।                                                                                                        |

Deno में server को `deno task serve` से चलाएँ; यह browser process के लिए
`--allow-run` देता है। आयात केवल app से ही शुरू हो सकता है: दूसरी
websites के requests server अस्वीकार करता है।

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
कुछ न लिखा हो तो केवल typical जवाब सुझाया जाता है — जो आपने उस संदेश पर
कम से कम दो बार दिया हो — और बहुत पुराने संदेश पर कोई सुझाव नहीं।
सुझाव browser में रखी आपके जवाबों के इतिहास की copy से आते हैं, इसलिए
लिखते ही दिखते हैं, reload के बाद और server के बिना भी; दुर्लभ सुझाव
server तब जोड़ता है जब आप रुकते हैं।
यह दिखाता है कि सामने वाला — या आपकी ओर से कोई automation — कब लिख रहा
है। भेजना network की API से होता है, और वह न चले तो उसके official web UI
से। **सेटिंग्स → रूप-रंग** theme (system, light, dark, या दिन के समय के
अनुसार auto) और skin (t3.codes, Telegram, WhatsApp या Signal) चुनता है।

संदेश Telegram Desktop की तरह काम करते हैं। किसी संदेश पर right-click
करें (फ़ोन पर दबाकर रखें): उसका menu वहीं खुलता है जहाँ आपने click किया
— reactions, फिर **जवाब दें** (टेक्स्ट का कुछ हिस्सा चुना हो तो **उद्धरण
के साथ जवाब दें**: जवाब उस हिस्से को उद्धृत करता है), **चयनित टेक्स्ट
कॉपी करें**, **संपादित करें**, **पिन करें**/**अनपिन करें**, फ़ोटो पर
**इस रूप में सहेजें…** और **छवि कॉपी करें**, **टेक्स्ट कॉपी करें**, किसी
link पर **लिंक कॉपी करें** वरना **संदेश का लिंक कॉपी करें** (channel में
**पोस्ट का लिंक कॉपी करें**), **फ़ॉरवर्ड**, **हटाएँ** और **चुनें**।
group में आने वाले संदेश के कोने में pointer के नीचे **जवाब दें** दिखता
है। किसी संदेश पर double-click (या फ़ोन पर बाईं ओर swipe) उसका जवाब देता
है; double-tap 👍 लगाता है। संदेश चुनने के लिए एक संदेश से दूसरे तक drag
करें (चुने हुए से शुरू करें तो चयन हटता है) या **चुनें** चुनें; फिर
click एक संदेश जोड़ता या हटाता है, Shift+click एक range, 100 तक। तब chat
की ऊपरी bar **फ़ॉरवर्ड n**, **हटाएँ n** और **रद्द करें** दिखाती है। चुने
हुए संदेश पर right-click से **चयनित को टेक्स्ट के रूप में कॉपी करें**,
**चयनित फ़ॉरवर्ड करें**, **चयनित हटाएँ**, **चयनित अनपिन करें** और **चयन
हटाएँ** मिलते हैं, किसी और पर **इस संदेश तक चुनें**। कई संदेश Telegram
Desktop की तरह कॉपी होते हैं, हर एक "[तारीख़ समय] नाम: टेक्स्ट" के रूप
में। **Esc** चयन ख़त्म करता है, **Ctrl/Cmd+C** कॉपी करता है, **Delete**
हटाता है। ख़ाली composer में **↑** आपका पिछला संदेश संपादित करता है, और
**Ctrl/Cmd+↑/↓** जवाब के लिए संदेश चुनते हैं।

chat सूची Telegram जैसी है: pinned chats सबसे ऊपर, अपने क्रम में, pin के
साथ; muted chat की गिनती धूसर; archived chats एक **संग्रहीत चैट** पंक्ति
के पीछे; और हर पंक्ति बताती है कि आख़िरी बार किसने और क्या लिखा ("🙂
स्टिकर", "फ़ोटो", तस्वीर के साथ)। किसी दूसरे device पर पढ़ी गई chat में
उतने ही अपठित रहते हैं जितने Telegram बताता है।

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
`/api/suggest` और `/api/suggest/model` (reply index links के रूप में,
`?format=lino` Links Notation के लिए, `?since=` केवल बदलावों के लिए)। पृष्ठभूमि:
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md)।

**आपके बिना कुछ नहीं भेजा जाता।** पढ़ना — आयात, नए संदेश लाना,
पूर्वावलोकन — ज़रूरत के अनुसार होता है। जो कुछ भी दूसरी सेवा में लिखता है
या जिसे दूसरे लोग देखेंगे (संदेश, पोस्ट, अभिवादन, आउटरीच, प्रोफ़ाइल या CV
का बदलाव), वह पहले दिखाया जाता है और तभी भेजा जाता है जब आप ठीक उसी की
पुष्टि करें: टाइप किए गए टेक्स्ट के नीचे "भेजें" बटन, मसौदे पर "भेजें"
बटन, या एक पुष्टि जो बताती है कि क्या जाएगा। शेड्यूल और आने वाले संदेशों
के ट्रिगर सिर्फ़ मसौदे तैयार करते हैं, auto मोड में भी। प्रोफ़ाइल या CV
सहेजने से वे इसी डिवाइस पर रहते हैं; प्रोफ़ाइल स्क्रीन पर **दूसरी सेवाओं
पर अपडेट करें** उन्हें चुने गए नेटवर्क पर प्रकाशित करता है। "टाइप कर रहे
हैं…" तभी साझा होता है जब आप इसे **सेटिंग्स → गोपनीयता** में चालू करें।
कमांड लाइन पर भेजने वाले कमांड योजना दिखाकर y/N पूछते हैं; स्क्रिप्ट
`--yes` देती हैं।

## 12. Troubleshooting

| Symptom                                                                    | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPA loading spinner पर अटका है।                                            | Dev tools → Application → IndexedDB में `meta-sovereign` database देखें; storage disabled हो सकता है।                                                                                                                                                                                                                                                                                                                                         |
| SPA local server तक नहीं पहुँचता।                                          | App में **Settings → Server** खोलकर exact URL paste करें।                                                                                                                                                                                                                                                                                                                                                                                     |
| Server चल रहा है, फिर भी hosted app browser-only mode में है।              | **Check again** click करें। Browser का local network prompt allow करें। Safari में: `node js/bin/meta-sovereign.js trust` एक बार चलाएँ (macOS) या **सर्वर पर भरोसा करें** (<https://127.0.0.1:8787/trust>) खोलें, Show Details → visit this website click करें, फिर **Check again** करें। या **सर्वर से ऐप खोलें** (<http://127.0.0.1:8787>) click करें। SPA खुद host करते हैं तो server को `--allow-origin=<आपका origin>` के साथ start करें। |
| Hosted app में photos और avatars की जगह initials या खाली frames दिखते हैं। | Server update करें: page pictures को CORS requests से माँगता है, जिन्हें server केवल app के अपने origins के लिए आने देता है। SPA खुद host करते हैं तो उसका origin `--allow-origin` से जोड़ें। ठुकराए गए loads log में `telegram_media_refused` (किस page ने और कैसे माँगा) के रूप में, page में असफल loads `client_media_failed` (route के हिसाब से गिनती) के रूप में दिखते हैं।                                                              |
| Reload के ठीक बाद कुछ messages या avatars नहीं दिखते।                      | कुछ सेकंड रुकें: chat अपने messages तब तक फिर माँगता है जब तक वे न आएँ, और Telegram से अभी download हो रही photo save होते ही दिखती है (पहली बार Telegram हर photo धीरे भेजता है)। बाद में saved photos तुरंत load होती हैं।                                                                                                                                                                                                                  |
| Server `EADDRINUSE` report करता है।                                        | `meta-sovereign serve --port=NNNN` या Rust `serve --port=NNNN` चलाएँ।                                                                                                                                                                                                                                                                                                                                                                         |
| WebRTC sync दो LANs के बीच रुकता है।                                       | TURN server configure करें: [`docs/WEBRTC-TURN.hi.md`](./WEBRTC-TURN.hi.md)।                                                                                                                                                                                                                                                                                                                                                                  |
| `cargo build` linker error देता है।                                        | C toolchain install करें (`build-essential` या Xcode CLI tools)।                                                                                                                                                                                                                                                                                                                                                                              |

## 13. आगे कहाँ जाएँ

- [`README.hi.md`](../README.hi.md) — project overview और developer notes।
- [`docs/REQUIREMENTS.hi.md`](./REQUIREMENTS.hi.md) — canonical requirements।
- [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md) — JS vs. Rust routes।
- [`docs/CV-SYNC.hi.md`](./CV-SYNC.hi.md) — CV synchronisation कैसे काम करता है, platform दर platform।
- [`docs/GREETINGS.hi.md`](./GREETINGS.hi.md) — greeting stickers और texts, network दर network।
- [`docs/UI-DESIGN-AUDIT.hi.md`](./UI-DESIGN-AUDIT.hi.md) — accessibility और design audit।
- [`docs/case-studies/`](./case-studies/) — हर issue की case studies।

**इस कंप्यूटर पर Telegram सेशन खोजें।** यदि आपने कई रिपॉज़िटरी में Telegram के
प्रयोग किए हैं, तो आपके साइन-इन पहले से इसी मशीन पर हैं — किसी प्रोजेक्ट के
`.env` में बॉट टोकन, किसी और के पास GramJS उपयोगकर्ता _स्ट्रिंग सेशन_
(`.telegram_session` के रूप में सहेजा)। **Connections → Telegram → Enter
manually** पर **Find my Telegram sessions** आपके प्रोजेक्ट फ़ोल्डरों (`~/Code`,
`~/projects`, … और वर्तमान डायरेक्टरी) को देखता है, **बॉट टोकन** और
**उपयोगकर्ता सेशन** दोनों इकट्ठा करता है, और उन्हें खाते के अनुसार समूहित करता
है — तीन रिपॉज़िटरी में मिला एक ही खाता एक के रूप में दिखता है। बॉट टोकन
`getMe` से पुष्ट होते हैं; उपयोगकर्ता सेशन फ़ोन से समूहित (और GramJS क्लाइंट
उपलब्ध होने पर पुष्ट भी)। फ़ोल्डर केवल पढ़े जाते हैं; ब्राउज़र को केवल प्रकार,
पथ और एक मास्क किया हिंट (अंतिम चार अक्षर) दिखता है — कभी टोकन या सेशन नहीं।
चुना हुआ `secret:telegram:*` के तहत सहेजा जाता है (पासफ़्रेज़ सेट होने पर
एन्क्रिप्टेड) और Telegram के अलावा कहीं नहीं भेजा जाता।

**फ़ोन से Telegram लॉगिन।** खोज के नीचे "अपने Telegram खाते से लॉग इन करें" Telegram Desktop और konard/telegram-bot की तरह साइन इन करता है: `api_id`, `api_hash` और नंबर डालें, "कोड भेजें" दबाएँ, Telegram का कोड (और 2FA पासवर्ड यदि हो) डालें — बनी हुई उपयोगकर्ता सेशन `secret:telegram:*` के तहत सहेजी जाती है। बॉट टोकन और पूर्ण उपयोगकर्ता खाते दोनों समर्थित हैं। साइन-इन लोकल सर्वर (GramJS) पर चलता है; GramJS इंस्टॉल होने पर मिला `.telegram_session` असली खाते से सत्यापित होता है।

**ईमेल लॉगिन और पासवर्ड।** ईमेल के "Enter manually" में IMAP/SMTP सर्वर, लॉगिन (पता) और पासवर्ड (या ऐप पासवर्ड) डाल सकते हैं — OAuth टोकन के अलावा `secret:email:host` / `secret:email:username` / `secret:email:password` के रूप में सहेजे जाते हैं।
