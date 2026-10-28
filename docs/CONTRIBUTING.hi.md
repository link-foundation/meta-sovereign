# meta-sovereign में योगदान (languages: [en](CONTRIBUTING.md) • [zh](CONTRIBUTING.zh.md) • hi • [ru](CONTRIBUTING.ru.md))

स्थानीय मशीन पर केवल बदलाव से जुड़े विशिष्ट टेस्ट चलाएँ। पूरा टेस्ट सूट, stress tests और runtime/browser matrices push के बाद GitHub CI/CD में चलाएँ। उपयोग में चल रही मशीन पर पूरा `npm test` या बिना फ़िल्टर वाला `bun test` न चलाएँ।

## Development Workflow

1. Repository fork करें और अपना fork clone करें।
2. Feature branch बनाएं: `git checkout -b feature/my-feature`।
3. Dependencies install करें: `bun install` या `npm install`।
4. Changes करें।
5. Local checks चलाएं: `bun run check`।
6. Changeset बनाएं: `bun run changeset`।
7. Commit और push करें; pre-commit hooks अपने-आप चलेंगे।
8. Pull Request बनाएं।

## Code Standards

### File Size Limits

हर file अधिकतम **1500 lines** होनी चाहिए। यह ESLint `max-lines` rule और CI
`check-file-line-limits` job से enforce होता है। इससे AI और human
developers files को एक context में पढ़ पाते हैं और modules maintainable
रहते हैं।

### Formatting और Linting

सभी code को pass करना होगा:

```bash
bun run format:check
bun run lint
bun run check
```

Manual fix:

```bash
bun run format
bun run lint:fix
```

### Testing Requirements

Tests critical paths cover करें, Node.js/Bun/Deno पर चलें, और
[`test-anywhere`](https://github.com/link-foundation/test-anywhere)
style से cross-runtime compatible रहें।

```bash
# Local: specific test files only
node --test --test-concurrency=1 js/tests/rolling-host.test.js
# Full suite: GitHub CI/CD after push
```

## Changesets से Version Management

Project [Changesets](https://github.com/changesets/changesets) से
versions और changelog manage करता है, ताकि multiple PRs `package.json`
version bump करके conflict न बनाएं।

Users को affect करने वाले changes के लिए changeset add करें:

```bash
bun run changeset
npm run changeset
```

| Type      | कब उपयोग करें             | Examples                    |
| --------- | ------------------------- | --------------------------- |
| **Patch** | Bug fix या internal work  | typo, dependency, refactor  |
| **Minor** | New feature, non-breaking | new function, optional arg  |
| **Major** | Breaking change           | remove function, change API |

सिर्फ `./docs` या Markdown changes को usually changeset नहीं चाहिए, जब तक
वे user-visible code behavior के साथ न हों।

## Pull Request

PR title clear होना चाहिए:

```text
feat: Add support for custom configuration
fix: Resolve race condition in async handler
docs: Update API documentation for v2
```

PR description में What, Why और Testing शामिल करें। सभी PRs syntax
check, format, ESLint, secrets scan, file line limits, changeset
validation, docs validation, और cross-platform/cross-runtime test matrix
pass करें।

CI latest `main` को PR branch में merge करके merged state पर checks
चलाता है। Conflict हो तो:

```bash
git fetch origin main
git merge origin/main
# resolve conflicts
git push
```

<a id="working-rules"></a>

## काम के नियम

ये हर बदलाव पर लागू होते हैं — लोगों और AI agents दोनों पर; हर agent यहीं से शुरू करता है (repository में agents के लिए अलग file नहीं रखी जाती)। हर नियम maintainer के निर्देश से आया है; जिन product requirements की ये रक्षा करते हैं वे [REQUIREMENTS.hi.md](REQUIREMENTS.hi.md) में हैं।

1. **हर बदलाव commit और push।** Checks पास होते ही `main` पर commit और push; इस बीच `main` आगे बढ़ा हो तो पहले उस पर rebase। Changeset में बताएँ कि बदलाव किन requirement IDs के लिए है।
2. **हर requirement track होती है।** नया निर्देश [REQUIREMENTS.hi.md](REQUIREMENTS.hi.md) में ID और status के साथ, चारों भाषाओं में, एक row बनता है; जो अभी खुला है उसका नाम status में होता है, छोड़ा नहीं जाता।
3. **चार भाषाओं में docs।** हर `docs/*.md` page अंग्रेज़ी, रूसी, हिंदी और चीनी में language header के साथ होता है; `docs/case-studies/` के case studies केवल अंग्रेज़ी में।
4. **Secrets machine से बाहर नहीं जाते।** Session strings, tokens, passwords और keys कभी print, log, commit या कहीं भेजे नहीं जाते; masked hints अधिकतम पहले और आख़िरी तीन अक्षर दिखाते हैं (R-Y5)।
5. **Tests और checks में केवल fakes।** Tests और जाँच कभी असली networks से नहीं जुड़ते, असली browser profiles या credential stores नहीं पढ़ते, user की machine scan नहीं करते और असली account से नहीं भेजते; वे fakes देते हैं (`clientFactory`, `telegramMtproto`, memory stores, अस्थायी folders) और असली app folder को नहीं छूते।
6. **चलते app को गिनती से देखें, सामग्री से नहीं।** चलते server को उसके status (`/api/telegram/status`) और log lines की गिनती से जाँचें; debugging में user के संदेश, contacts या credentials print न करें।
7. **हर network से एक बार पूछें।** पहले store, network से केवल जो नहीं है, account की priority queue से (R-Y24, R-Y25); network ने जो बताया सब रखें (R-Y28)।
8. **दूसरों का code reference है, dependency नहीं।** जिन open-source clients से हम सीखते हैं वे [CHAT-REFERENCES.hi.md](CHAT-REFERENCES.hi.md) में हैं; download की गई copies केवल पढ़ी जाती हैं — कभी build, install या run नहीं।
9. **Quality gates चालू रहें।** स्थानीय रूप से बदली हुई फ़ाइलें और विशिष्ट टेस्ट जाँचें। पूरे checks और tests push के बाद GitHub CI/CD में चलाएँ; उपयोगकर्ता की मशीन पर पूरा सूट न चलाएँ। सीमा से बड़ी functions बाँटें; web बदलाव पर `js/src/web/app.min.js` फिर build करें (`npm run build:web`)।
10. **अपने user के लिए local app।** meta-sovereign open source है और user की अपनी machine पर, उसके अपने accounts के साथ, उसकी सुविधा के लिए चलता है: यह तभी और वैसे ही काम करता है जैसे user कहे, हर network की अनुमति वाली गति से।
11. **Browsers browser-commander से, automation bars के बिना।** App जो browser खोलता है, और बदलाव जाँचते समय web app देखने वाला browser, [browser-commander](https://github.com/link-foundation/browser-commander) के default launch से शुरू होता है (installed Chrome वैसे जैसे कोई व्यक्ति उसे खोलता है): कभी ऐसे switch के साथ नहीं जिससे Chrome "controlled by automated test software" या "unsupported command-line flag" bar दिखाए (`--enable-automation`, `--disable-blink-features=AutomationControlled`)। browser-commander में ही ऐसा bar दिखे तो उसके repository में report किया जाता है।
12. **डेटा के आकार में बदलाव के साथ माइग्रेशन आता है।** अगर कोई बदलाव किसी चीज़ के संग्रहण का तरीक़ा बदलता है (फ़ील्ड, id, तारीख़ का प्रारूप), तो `js/src/storage/migrations/` में क्रमांकित माइग्रेशन मॉड्यूल जोड़ें और `CURRENT_SCHEMA` बढ़ाएँ (R-Z17): idempotent, नेटवर्क के बिना, पुराने आकार के स्टोर पर फ़िक्स्चर टेस्ट, idempotency टेस्ट, dry-run गिनती और [DATA-MIGRATIONS.hi.md](DATA-MIGRATIONS.hi.md) में एक पंक्ति के साथ। कुछ छूटे तो रजिस्ट्री का गार्ड टेस्ट विफल होता है।

## Questions?

Contribution process पर सवाल हो तो discussion के लिए issue खोलें।

CI निदान, प्रकाशन की शर्तें और recovery: [CI संचालन](CI-OPERATIONS.hi.md) (R-Z32)।
