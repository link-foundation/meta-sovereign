# meta-sovereign (languages: [en](README.md) • [zh](README.zh.md) • hi • [ru](README.ru.md))

**आप जिन भी नेटवर्क पर बात करते हैं, उन सबके लिए एक इनबॉक्स, एक संपर्क सूची और एक ही ऑटोमेशन — आपकी अपनी मशीन पर।**

meta-sovereign **किसी व्यक्ति या संगठन को ऑनलाइन दर्शाता है**। Telegram, VK, WhatsApp, Facebook और Instagram, X, LinkedIn, ईमेल, GitHub, Upwork, PeoplePerHour और जॉब बोर्ड (career.habr.com, hh.ru, superjob.ru और अन्य) जोड़ें और हर बातचीत एक ही ऐप से करें। Local-first और open source: आपके संदेश, संपर्क और कुंजियाँ आपके अपने स्टोर में रहती हैं, एन्क्रिप्टेड बैकअप के साथ और बीच में कोई क्लाउड नहीं।

### किसके लिए

| कौन / क्या            | meta-sovereign कैसे मदद करता है                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **व्यक्ति**           | सभी चैट एक जगह, लंबे समय से चुप लोगों से फिर जुड़ना, जो कहा गया वह याद रखना (तथ्य), हर जॉब साइट पर एक जैसा CV।                                        |
| **बिक्री**            | हर नेटवर्क के लीड एक CRM में, नियम से ऑडियंस, mass-personal outreach जिसमें हर संदेश एक ही बार और शालीनता से जाता है, फ़ॉलो-अप, तेज़ उत्तर।           |
| **मार्केटिंग**        | ऑडियंस को broadcast, Telegram चैनल, LinkedIn और X पर पोस्ट, community सदस्य हमेशा ताज़ा, एक opt-out सूची जिसे हर स्वचालित भेजना मानता है।             |
| **उपयोगकर्ता सहायता** | अपठित बातचीत के लिए एक Operator कतार, VK community या Telegram Business खाते से उत्तर, सुरक्षित ड्राफ़्ट के रूप में auto-reply, तथ्यों का ज्ञान-आधार। |
| **संगठन**             | ब्रांड, दुकान या प्रोजेक्ट के लिए वही उपकरण: उसके खाते, उसके संपर्क, उसका डेटा उसकी अपनी मशीन पर। टीम मोड (कई ऑपरेटर) रोडमैप में है।                  |

हर परिदृश्य के लिए आज क्या चलता है, क्या आंशिक है और आगे क्या है — रोडमैप में: [`docs/ROADMAP.hi.md`](docs/ROADMAP.hi.md)।

## अभी चलाकर देखें (install नहीं)

किसी भी आधुनिक browser में <https://link-foundation.github.io/meta-sovereign/> खोलें। Web app तुरंत boot होता है, पूरी तरह browser में चलता है, और default रूप से local storage में लिखता है। जब तक आप server नहीं जोड़ते, आपका data device से बाहर नहीं जाता।

> अगर link अभी live नहीं है, तो GitHub Pages workflow (`.github/workflows/pages.yml`) अगली `main` push पर इसे publish करेगा।

Server के बिना hosted app **browser-only mode** में चलता है: contacts, patterns और broadcasts browser store से काम करते हैं, जबकि imports, automations, sync, CV sync और greetings local server का इंतज़ार करते हैं। एक notice server start करने का command और **Check again** button दिखाता है।

## Desktop app

अपने system का installer <https://link-foundation.github.io/meta-sovereign/download/> से या [GitHub releases](https://github.com/link-foundation/meta-sovereign/releases) से download करें: Linux (AppImage, deb, tar.gz), macOS (dmg, zip) और Windows (installer, portable), हर एक x64 और arm64 के लिए। Desktop app में server bundled है, इसलिए खुद server start किए बिना हर feature काम करता है। Unsigned builds की पहली launch, checksums और updates [`docs/USER-GUIDE.hi.md` §4](docs/USER-GUIDE.hi.md#4-desktop-या-mobile-app-install-करें) में हैं।

## local server चलाएँ (sync के लिए recommended)

Devices के बीच sync, encrypted backups और पूरा feature set इस्तेमाल करने के लिए SPA के पास local server start करें। दो backend उपलब्ध हैं; दोनों समान wire protocol लागू करते हैं (देखें [`docs/SERVER-PARITY.hi.md`](docs/SERVER-PARITY.hi.md))।

### Rust server — single binary, runtime नहीं, पर सीमित

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

> **Rust server की सीमाएँ।** यह links को **सिर्फ़ memory में** रखता है: disk पर कुछ नहीं लिखा जाता, इसलिए server बंद होते ही सारा data चला जाता है। इसमें **कोई source adapters नहीं हैं**: Telegram, VK, GitHub, Upwork आदि से live fetch नहीं, outbound HTTP/TLS client नहीं (email सिर्फ़ archives ingest करता है), और automations, CV sync, browser auto-import, backups तथा `/api/export-encrypted` नहीं हैं। असली इस्तेमाल के लिए JS server या desktop app चुनें। Route-by-route सूची [`docs/SERVER-PARITY.hi.md`](docs/SERVER-PARITY.hi.md) में है।

### JavaScript server — पूरा feature set (Node/Bun/Deno), source से

Package अभी **npm पर publish नहीं है** (registry 404 देती है), इसलिए `npx -y meta-sovereign serve` आज काम नहीं करता। Server को source checkout से चलाएँ (Node.js और npm चाहिए):

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
npm install
node js/bin/meta-sovereign.js serve
```

Package npm पर publish होने के बाद `npx -y meta-sovereign serve` (या `npm install -g meta-sovereign && meta-sovereign serve`) काम करेगा। तब तक toolchain के बिना server चलाने का तरीका desktop app (ऊपर) है।

दोनों backend default रूप से <http://127.0.0.1:8787> पर listen करते हैं। JS server hosted app के origin (`https://link-foundation.github.io`) को CORS headers के साथ जवाब देता है; दूसरे origins `meta-sovereign serve --allow-origin=<origins>` या `MS_ALLOW_ORIGINS` से allow करें। Safari `https` pages को `http://127.0.0.1` तक नहीं पहुँचने देता, लेकिन `https://127.0.0.1` तक पहुँचने देता है; server अब उसी port पर HTTPS का भी जवाब देता है और इसके लिए localhost का अपना certificate बनाता है। एक बार `node js/bin/meta-sovereign.js trust` चलाएँ (macOS login keychain में जोड़ता है; दूसरे systems पर certificate का path print होता है) या Safari में `https://127.0.0.1:8787/trust` खोलें और prompts follow करें — उसके बाद hosted app Safari में सीधे server से connect हो जाता है। Trust से पहले notice server का नाम और **सर्वर पर भरोसा करें** (<https://127.0.0.1:8787/trust>) दिखाता है; localhost UI का link तभी मिलता है जब वह स्पष्ट रूप से enable हो। `--tls=false` / `MS_TLS=off` HTTPS बंद करता है। Safari trusted local HTTPS API से hosted app उपयोग करता है; localhost UI वैकल्पिक है। Hosted SPA `discoverServer()` से local server खोजता है (saved override → `127.0.0.1` ports)। अगर browser auto-connect नहीं करता, app में **Settings → Server** खोलें और binary द्वारा print किया गया URL paste करें।

Default UI hosted app है: `serve` उसका पता छापता है, <https://link-foundation.github.io/meta-sovereign/>, और app हमारे port 8787 पर server को खुद ढूँढ लेता है (वह 8788, 7001, 7002 और 3000 भी देखता है; किसी दूसरे port पर `serve` बताता है कि उसे **Settings → Server** में set करें), इसलिए server को web site host नहीं करनी पड़ती। Default रूप से `/` GitHub Pages पर redirect करता है और server केवल API, sync transports और connection helpers देता है। बिना internet के लिए localhost web app वैकल्पिक है: `serve --local-ui=true` (या `MS_LOCAL_UI=on`) से enable करें; फिर वह <http://127.0.0.1:8787> पर मिलता है। Desktop shell अपना bundled UI स्पष्ट रूप से enable करता है। `--ui-url=<url>` (या `MS_UI_URL`) कोई दूसरी hosted copy बताता है, जैसे किसी fork का Pages, और उसके origin को अनुमति देता है।

macOS पर interactive `serve` पूरा setup करता है: इस installation की TLS key को Secure Enclave से protect करता है, certificate trust जाँचता है, जरूरत पर ही trust माँगता है और GitHub Pages app खोलता है। Headless launch: `node js/bin/meta-sovereign.js serve --trust=true --open=true`। `--trust=false` और `--open=false` से opt out करें। Swift helper को macOS Command Line Tools चाहिए; unsupported Mac पर `--hardware-key=false` स्पष्ट रूप से file key चुनता है। Hardware protection disk की key पर लागू है; Node key को memory में उपयोग करता है। नियम और सीमाएँ: [local server setup और security](docs/LOCAL-SERVER-SECURITY.md)।

खुली चैट पहले लोड होती है और लोडिंग या पुनःप्रयास की स्थिति दिखाती है। सभी / निजी / समूह / चैनल फ़िल्टर हर Telegram फ़ोल्डर में उपलब्ध हैं। कॉलम की चौड़ाई ऊर्ध्वाधर डिवाइडर खींचकर बदलें; आकार याद रखे जाते हैं। कॉल मुख्य मेनू में चैट के बाद है और Telegram खाता संपादन प्रोफ़ाइल में है। डार्क थीम में नियंत्रण सफ़ेद रेखा आइकन इस्तेमाल करते हैं। JS सर्वर OS उपयोगकर्ता की ऐप फ़ोल्डर में डेटा रखता है: macOS में `~/Library/Application Support/Meta Sovereign/store`, Windows में `%APPDATA%/Meta Sovereign/store` और Linux में `${XDG_CONFIG_HOME:-~/.config}/Meta Sovereign/store`। पुराने checkout से `serve` चलाने पर `.meta-sovereign` एक बार स्थानांतरित होता है; संदेश, संपर्क, सत्र, मीडिया और प्रमाणपत्र सुरक्षित रहते हैं तथा लिंक पुराने पथ बनाए रखता है। रीस्टार्ट और अलग कार्य निर्देशिका में वही स्टोर इस्तेमाल होता है। `--store` या `META_SOVEREIGN_STORE_DIR` से बदलें। [चैट और डेटा संग्रहण](docs/CHAT-READINESS.md) देखें।

## SPA को server से जोड़ें

SPA server को इस क्रम में चुनता है ([`js/src/web/discover.js`](js/src/web/discover.js)):

1. **Same origin** — जब SPA सीधे JS या Rust server से serve हो।
2. **Saved override** — `localStorage.metaServer`, जिसे app का **Settings → Server** prompt set करता है।
3. **Runtime shell candidates** — Electron और Capacitor embedded server URL inject करते हैं।
4. **`127.0.0.1` ports** — default local-server port automatic probe होता है।
5. **Caller-supplied LAN candidates** — programmatically pass किए गए URLs।

यदि कोई server जवाब नहीं देता, SPA **offline mode** में रहता है: writes local browser store में जाती हैं ([`createBrowserStore`](js/src/storage/browser-store.js): IndexedDB → localStorage → memory) और अगली बार server मिलने पर [`OfflineClient`](js/src/web/client.js) उन्हें replay करता है।

पूरी user flow guide — बिना install, Rust server, JS server, desktop/mobile app, encrypted export और troubleshooting — [`docs/USER-GUIDE.hi.md`](docs/USER-GUIDE.hi.md) में है।

## यह क्या करता है

- **एकीकृत इनबॉक्स**: VK, Telegram, X, WhatsApp, Facebook, Instagram, LinkedIn, ईमेल, GitHub, Upwork, PeoplePerHour और जॉब बोर्ड; जहाँ नेटवर्क अनुमति देता है वहाँ लाइव अपडेट (Telegram, VK Long Poll, incremental IMAP, GitHub), बाकी के लिए किसी भी आकार के आर्काइव का आयात।
- **Telegram के अपने ऐप जैसी चैट**: हर संदेश एक बार भेजा जाता है, डिलीवरी टिक, लाइव अपडेट और अंतराल के बाद catch-up, पढ़ा-चिह्न, cloud ड्राफ़्ट, reload के बाद भी बचे रहने वाले retry ([`docs/CHAT-REFERENCES.hi.md`](docs/CHAT-REFERENCES.hi.md))।
- **CRM**: किसी संपर्क के बारे में सब कुछ एक दृश्य में, अलग-अलग नेटवर्क पर वही व्यक्ति, communities और सदस्यताएँ, खोज, नियम से ऑडियंस (`friends:vk & chat:vk:… - list:blocked`)।
- **संपर्क आयात**: macOS Contacts (सिंक किए गए iCloud खातों सहित) या किसी भी प्लेटफ़ॉर्म के vCard निर्यात का पूर्वावलोकन करके आयात करें। दोबारा आयात करने पर रिकॉर्ड की पहचान बनी रहती है। निर्देशिका सिंक के दौरान अपडेट होती है और बिना संदेश वाले लोग भी दिखाती है। [संपर्क आयात](docs/CONTACTS-IMPORT.md) देखें।

- **Outreach, broadcast और ऑटोमेशन**: किसे, कब, किन शर्तों पर और किस पाठ से लिखना है; कौन क्या पाएगा इसका preview; डिफ़ॉल्ट रूप से सुरक्षित ड्राफ़्ट, या quiet hours, हर चैट का cooldown, दैनिक सीमा और opt-out सूची के साथ धीमी गति से स्वचालित भेजना। हर स्वचालित भेजना एक ही outbox से जाता है: अधिक से अधिक एक बार, और अस्पष्ट परिणाम अपने आप दोहराया नहीं जाता ([`docs/USER-GUIDE.hi.md`](docs/USER-GUIDE.hi.md), §11)।
- **Operator कतार और उत्तर**: अपठित संदेश चैट-दर-चैट, आपके पिछले उत्तरों से सुझाव (Tab एक चुनता है), पैटर्न और उत्तर के रूप, मिलते संदेश पर auto-reply।
- **कार्य खाते**: Upwork, Fiverr, PeoplePerHour और Wellfound के लिए अलग ब्राउज़र विंडो में मैन्युअल साइन-इन, स्थायी सत्र और स्थानीय प्रोफ़ाइल स्नैपशॉट Connections और Profile में उपलब्ध हैं। यह शुरुआती समर्थन है; [गाइड](docs/WORK-ACCOUNTS.md) देखें।
- **व्यवसाय और community खाते**: VK community token Bots Long Poll चलाता है; Telegram Business के quick replies, स्वागत और अनुपस्थिति संदेश, कार्य-समय और chatbots।
- **स्मृति**: बातचीत से निकाले गए `प्रश्न → उत्तर` तथ्य, चैट में जाँच के साथ।
- **अभिवादन**: VK, Telegram, WhatsApp, Messenger, X और ईमेल पर "hi" या स्टिकर से बातचीत शुरू करें, [konard/vk-bot](https://github.com/konard/vk-bot) की तरह ([`docs/GREETINGS.hi.md`](docs/GREETINGS.hi.md))।
- **CV सिंक**: LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks, TopCV और SuperJob पर आपके अपने ब्राउज़र से, फ़ील्ड-दर-फ़ील्ड ([`docs/CV-SYNC.hi.md`](docs/CV-SYNC.hi.md))।
- **आपका डेटा सुरक्षित**: crash-safe लोकल स्टोर ([Doublets](https://github.com/linksplatform/doublets-rs) + [Links Notation](https://github.com/link-foundation/links-notation)), स्वचालित schema migrations ([`docs/DATA-MIGRATIONS.hi.md`](docs/DATA-MIGRATIONS.hi.md)), streamed एन्क्रिप्टेड बैकअप, भरी डिस्क का प्रबंधन, एन्क्रिप्टेड secrets, एक लोकल सर्वर जो दूसरी साइटों को मना करता है।
- **हर जगह**: वेब ऐप, सर्वर सहित डेस्कटॉप ऐप, मोबाइल shells, आपके उपकरणों के बीच WebRTC सिंक, ऑफ़लाइन लिखे को बाद में भेजना; pure-Rust सर्वर वही on-disk format उपयोग करता है।
- **चार भाषाएँ**: ऐप और हर दस्तावेज़ अंग्रेज़ी, रूसी, हिंदी और चीनी में।

हर नेटवर्क की हर सुविधा — समर्थित, आंशिक या असमर्थित, और API या वेब ऐप से पहुँच: [`docs/FEATURES.hi.md`](docs/FEATURES.hi.md)। हर आवश्यकता और उसका प्रमाण: [`docs/REQUIREMENTS.hi.md`](docs/REQUIREMENTS.hi.md)।

## स्थिति

आवश्यकताएँ R-A से R-Z24 पूरी हैं और CI में Linux, macOS और Windows पर Node, Bun और Deno के साथ जाँची जाती हैं, Chromium में browser end-to-end tests के साथ। Tests नकली सर्वर उपयोग करते हैं: किसी असली खाते से कुछ नहीं भेजा जाता, और केवल Telegram के संदेश-प्रदर्शन को असली स्टोर पर भी जाँचा गया। परिदृश्य-वार स्थिति और अगले कदम (लाइव खातों पर जाँच, OAuth साइन-इन, टीम मोड, बिक्री pipeline, अभियान परिणाम): [`docs/ROADMAP.hi.md`](docs/ROADMAP.hi.md)।

## Repository structure

`meta-sovereign` multi-language repository है:

- **JavaScript** `js/` में रहता है: `js/src/`, `js/tests/`, `js/scripts/`, `js/bin/`, `js/electron/`, `js/examples/`, `js/experiments/`।
- **Rust** `rust/` में रहता है: workspace manifest, lockfile और crates।
- **Native shells**: `js/electron/`, `mobile/`, `capacitor.config.json`, `docker/`।
- **Operations**: `.github/workflows/`, `.changeset/`, `docs/`।

```
.
├── .changeset/           # Changeset configuration
├── .github/workflows/    # GitHub Actions CI/CD
├── docker/               # Web + WebRTC Dockerfiles
├── docs/                 # Requirements, user guide, server parity, case studies
├── js/                   # JavaScript tree
├── mobile/               # Capacitor mobile shell
├── rust/                 # Rust workspace
└── package.json          # Node.js package manifest
```

---

## Developer reference

यह भाग contributors के लिए है।

### Quick start

```bash
bun install
bun test
npm test
deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests

RUN_BROWSER_E2E=1 npm run test:e2e:browser
cargo test --manifest-path rust/Cargo.toml --workspace
npm run build:web
npm run build:pages
bun run lint
bun run format:check
```

### CI/CD और quality gates

Pipeline fast checks, slow matrix tests, API docs build, broken-link checks और automated release चलाता है। हर job में explicit `timeout-minutes` है, और individual tests में `node --test --test-timeout=30000` / `bun test --timeout 30000` guard है।

हर PR को ये checks पास करने चाहिए:

- ESLint और Prettier;
- `jscpd` duplication check;
- secrets scan;
- file line limits;
- Node, Bun, Deno × Ubuntu, macOS, Windows test matrix;
- docs बदलने पर documentation validation।

विस्तार के लिए [`docs/BEST-PRACTICES.hi.md`](docs/BEST-PRACTICES.hi.md) देखें।

### Scripts reference

| Script                 | Description                       |
| ---------------------- | --------------------------------- |
| `bun test`             | Bun से tests चलाएँ                |
| `bun run lint`         | ESLint से code जाँचें             |
| `bun run lint:fix`     | lint issues auto-fix करें         |
| `bun run format`       | Prettier से formatting करें       |
| `bun run format:check` | formatting check करें             |
| `bun run check`        | lint + format + duplication चलाएँ |
| `bun run changeset`    | नया changeset बनाएँ               |
| `bun run build:web`    | production SPA bundle बनाएँ       |
| `bun run build:pages`  | `dist/pages/` artifact बनाएँ      |
| `bun run build:mobile` | Capacitor mobile bundle बनाएँ     |

### Contributing

विस्तृत guidelines [`docs/CONTRIBUTING.hi.md`](docs/CONTRIBUTING.hi.md) में हैं। सामान्य flow: fork करें, branch बनाएँ, बदलाव करें, changeset बनाएँ, commit करें, push करें और Pull Request खोलें।

## License

[Unlicense](LICENSE) - public domain.
