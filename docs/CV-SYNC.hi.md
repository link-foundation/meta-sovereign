# Job platforms के बीच CV synchronisation (languages: [en](CV-SYNC.md) • [zh](CV-SYNC.zh.md) • hi • [ru](CV-SYNC.ru.md))

एक CV आम तौर पर एक साथ सात जगह रहता है: LinkedIn, hh.ru, Habr Career,
Naukri, VietnamWorks, TopCV, SuperJob। हर जगह थोड़ी अलग और थोड़ी पुरानी
copy पड़ी रहती है, और सातों को हाथ से एक जैसा कोई नहीं रखता।

यह subsystem इन सभी profiles को असली browser से पढ़ता है, हर एक को एक ही
canonical CV में बदलता है, अंतर दिखाता है और तय किए गए values वापस लिख
देता है। सब कुछ local है: browser उपयोगकर्ता की अपनी machine पर उसकी अपनी
logged-in session के साथ चलता है, और उस platform के अलावा — जिसे
उपयोगकर्ता पहले से इस्तेमाल कर रहा है — कहीं कुछ नहीं भेजा जाता।

संबंधित दस्तावेज़: [REQUIREMENTS खंड V](REQUIREMENTS.hi.md),
[USER-GUIDE](USER-GUIDE.hi.md), [issue 29 case study](case-studies/issue-29/README.md)।

## 1. परतें

| परत       | फ़ाइल                          | ज़िम्मेदारी                                                                         |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Model     | `js/src/cv/model.js`           | एक canonical CV आकार और उसका links-notation projection (R-V1)।                      |
| Diff      | `js/src/cv/diff.js`            | Key और path के हिसाब से तुलना और मेल (R-V2)।                                        |
| Plans     | `js/src/cv/platforms/*.js`     | हर platform के लिए एक declarative, केवल-data plan (R-V3..R-V11)।                    |
| Registry  | `js/src/cv/platforms/index.js` | Catalogue, validation और confidence गणना (R-V12)।                                   |
| Telemetry | `js/src/cv/telemetry.js`       | हर step, value, fallback और fingerprint — redaction के साथ (R-V13)।                 |
| Runner    | `js/src/cv/runner.js`          | Plan को browser-commander पर चलाता है (R-V14)।                                      |
| Browser   | `js/src/cv/browser.js`         | स्थायी browser-commander session खोलता है (R-V14)।                                  |
| Facade    | `js/src/cv/index.js`           | `readCvFrom`, `compareAllCvs`, `updateCvOn`, `syncCvAcross` (R-V15)।                |
| HTTP      | `js/src/server/routes-cv.js`   | `/api/cv/*` (R-V16)।                                                                |
| CLI       | `js/src/cli/cv-commands.js`    | `cv-platforms`, `cv-plan`, `cv-read`, `cv-diff`, `cv-sync`, `cv-telemetry` (R-V17)। |
| SPA       | `js/src/web/cv-view.js`        | CV screen (R-V18), Node path को browser bundle से बाहर रखते हुए (R-V19)।            |

परतें हमेशा नीचे की ओर ही बात करती हैं, और browser के होने की जानकारी
सिर्फ runner को है। इसीलिए पूरा प्रवाह — “ये चार fields Naukri पर लिखो”
सहित — बिना browser के testable है।

## 2. Canonical CV

```text
cv
  basics
    name: Anna Ivanova
    headline: Backend Engineer
    location: Yerevan, Armenia
  skills
    skill: Go
    skill: Kubernetes
  experience
    position
      company: Acme
      title: Backend Engineer
      start: 2022-01
```

Sections तीन तरह के होते हैं:

- **maps** — `basics` (`name`, `headline`, `summary`, `email`, `phone`,
  `location`, `website`, `birthDate`) और `preferences` (`employment`,
  `schedule`, `salary`, `currency`, `relocation`, `remote`);
- **lists** — `skills`;
- **records** — `experience`, `education`, `languages`, `links`, हर एक की
  एक identity key होती है (`experience` की key company + title + start
  है), ताकि diff दो platforms पर एक ही नौकरी को आपस में मिलाए, न कि किसी
  site के उल्टे क्रम पर “सब कुछ बदल गया” बता दे।

हर value को path से address किया जाता है: `basics.headline`, `skills`,
`experience[0].title`। Paths ही diff की शब्दावली हैं, CLI के `--paths` की
भी, और हर platform द्वारा घोषित `writePaths` allow-list की भी।

## 3. Plans data हैं

Plan steps की क्रमबद्ध सूची है। Plan में कोई function नहीं होता, इसलिए
plan को print किया जा सकता है, diff किया जा सकता है, CI में validate किया
जा सकता है, और ऐसे platform के लिए भी भेजा जा सकता है जिसका authenticated
markup हम अभी तक नहीं ला पाए।

| Action        | अर्थ                                                                            |
| ------------- | ------------------------------------------------------------------------------- |
| `goto`        | URL पर जाएँ (`{{login}}` जैसे templates भर दिए जाते हैं)।                       |
| `waitFor`     | Selector का इंतज़ार करें; timeout drift के रूप में दर्ज होता है, crash नहीं।    |
| `requireUrl`  | जाँचें कि हम अब भी वहीं हैं जहाँ होना चाहिए — यही “क्या मैं logged in हूँ?” है। |
| `click`       | पहले match पर click करें।                                                       |
| `fill`        | Canonical value field में लिखें, और पढ़कर सत्यापित करें।                        |
| `press`       | एक key भेजें।                                                                   |
| `read`        | एक scalar को किसी path में पढ़ें।                                               |
| `readList`    | हर match को list section में पढ़ें।                                             |
| `readRecords` | हर container match पर एक record, fields उसी के सापेक्ष।                         |
| `extractJson` | Server-rendered JSON parse करें और नामित mapper से map करें।                    |
| `snapshot`    | किसी क्षेत्र का HTML run artifact के रूप में सहेजें।                            |
| `screenshot`  | Viewport का PNG run artifact के रूप में सहेजें।                                 |

हर selector candidates की सूची हो सकता है (`a, b, c`)। Runner उन्हें क्रम
से आज़माता है और जब भी पहले के अलावा कुछ इस्तेमाल करना पड़े,
`selector.fallback` event भेजता है — यही सबसे पहली चेतावनी है कि site ने
अपना markup बदल दिया।

हर step पर confidence स्तर होता है:

- `verified` — उस markup में देखा गया जो हमने खुद लाया; platform का
  `evidence` array URL, तारीख और निष्कर्ष रखता है।
- `documented` — vendor documentation या public API से लिया गया।
- `draft` — सार्वजनिक जानकारी से अनुमानित, पहली authenticated run से
  पुष्टि होना बाकी। Drafts code में छिपे अनुमान नहीं हैं: वे labelled और
  गिने हुए हैं, `cv-plan` उन्हें print करता है और SPA उन्हें दिखाता है।

## 4. Platform coverage

| Platform     | Id             | क्षेत्र | Markup access             | Read paths | Write paths | Steps | Verified          | Drafts |
| ------------ | -------------- | ------- | ------------------------- | ---------- | ----------- | ----- | ----------------- | ------ |
| LinkedIn     | `linkedin`     | global  | authenticated             | 7          | 4           | 32    | 7                 | 25     |
| hh.ru        | `hh`           | ru      | authenticated             | 10         | 4           | 30    | 6 (+2 documented) | 22     |
| Habr Career  | `habr-career`  | ru      | public profile            | 2 (+JSON)  | 3           | 17    | 12                | 5      |
| Naukri       | `naukri`       | in      | authenticated             | 10         | 3           | 34    | 7                 | 27     |
| VietnamWorks | `vietnamworks` | vn      | authenticated             | 9          | 8           | 32    | 11                | 21     |
| TopCV        | `topcv`        | vn      | blocked without a browser | 12         | 6           | 32    | 5                 | 27     |
| SuperJob     | `superjob`     | ru      | authenticated             | 6          | 2           | 18    | 5                 | 13     |

`markupAccess` ईमानदारी से बताता है कि session के बाहर से हमें क्या दिखा:
`public-profile` का मतलब पढ़ने वाला हिस्सा live markup पर सत्यापित है,
`authenticated` का मतलब profile login page पर भेज देता है, और
`blocked-without-browser` का मतलब site सादे HTTP client को challenge page
देती है — और ठीक इसीलिए यह पूरा subsystem असली browser चलाता है।

`cv-platforms --json` और `GET /api/cv/platforms` यही तालिका सीधे registry
से लौटाते हैं, इसलिए यह code से अलग नहीं हो सकती।

## 5. Update groups

लिखना समूहों में होता है, क्योंकि ये sites ऐसे ही काम करती हैं: “Headline”
modal खोलना, लिखना, सहेजना और बंद करना — यह एक ही इकाई है। हर group की एक
id है (`intro`, `about`, `skills`, `headline`, `key-skills`, `employment`,
`personal`, `preferences`, `cv-builder`, `objective`, `expectation`,
`cv-document`, `title`, `publish`) और उसे `cv-sync --groups=…` से (या
`/api/cv/sync` पर `"groups": [...]` से) चुना जा सकता है, ताकि उपयोगकर्ता
बाकी कुछ छुए बिना सिर्फ headline लिख सके। `--paths=basics.headline` उसी run
को CV path के हिसाब से सीमित करता है; जिस path को platform support करता है
पर उपयोगकर्ता ने नहीं चुना, वह `deselected` के रूप में report होता है — यह
जानबूझकर `unsupported` से अलग गिनती है।

Platform की `writePaths` एक allow-list है। उसके बाहर के बदलावों को
`syncCvAcross` `unsupported` बताकर report करता है, लागू करने का दिखावा नहीं
करता: LinkedIn profile form से किसी employment record को दोबारा लिखने नहीं
देता, और plan चुपचाप विफल होने के बजाय यही कहता है।

## 6. Telemetry

हर run एक क्रमबद्ध event stream देता है, जो store में `cv-telemetry` token
prefix के नीचे सहेजा जाता है और `cv-telemetry` या
`GET /api/cv/telemetry` से दोबारा देखा जा सकता है:

| Event                | कब निकलता है                                                  |
| -------------------- | ------------------------------------------------------------- |
| `run.start`          | read / update / drift run शुरू होता है।                       |
| `step.start`         | हर step से पहले, उसके action और confidence के साथ।            |
| `step.ok`            | Step ने वही किया जो कहा था, और वास्तव में उपयोग हुआ selector। |
| `step.skip`          | वैकल्पिक step जिसकी शर्त पूरी नहीं हुई।                       |
| `step.miss`          | Selector को कुछ नहीं मिला, या इंतज़ार timeout हो गया।         |
| `step.error`         | Step ने error फेंका।                                          |
| `value.read`         | कोई value CV में आई (redacted)।                               |
| `value.write`        | कोई value page में लिखी गई, सत्यापन परिणाम के साथ।            |
| `selector.fallback`  | पहले के बजाय बाद वाला candidate इस्तेमाल हुआ।                 |
| `markup.fingerprint` | Snapshot किए गए क्षेत्र का FNV-1a fingerprint।                |
| `markup.changed`     | वह fingerprint दर्ज baseline से अलग है।                       |
| `screenshot`         | एक PNG artifact लिखा गया।                                     |
| `run.finish`         | कुल गणना, अवधि और परिणाम।                                     |

Redaction डिफ़ॉल्ट रूप से चालू है: e-mail पते, phone numbers और लंबे token
जैसा दिखने वाला सब कुछ event सहेजने से पहले बदल दिया जाता है। Artifact
paths इससे बाहर हैं, क्योंकि जो path उपयोगकर्ता खोल ही न सके वह सबूत नहीं
है।

`--artifacts=<dir>` के साथ `snapshot` और `screenshot` steps
`<dir>/<runId>/<name>.html` और `.png` लिखते हैं। यही markup बदलाव की वह
recording है जो issue माँगता है: जब कोई site कोई field हटाकर कहीं और रखती
है, तो उसे पकड़ने वाली run के पास event stream के बगल में HTML और तस्वीर
दोनों होती हैं।

उस path के दोनों segment ऐसे लिखे जाते हैं जिन्हें हर file system स्वीकार
करे: run id `linkedin-2026-09-16T07-00-00.000Z` जैसा दिखता है, ISO
timestamp जैसा नहीं — क्योंकि Windows path में आए `:` को
alternate-data-stream separator मानता है और directory बनाता ही नहीं।

## 7. Drift पकड़ना

किसी स्वस्थ run के `markup.fingerprint` events baseline बनाते हैं। बाद की
run उससे तुलना करती है और, कुछ भी लिखे जाने से पहले, हर खिसके हुए क्षेत्र
के लिए `markup.changed` भेजती है। Runner “selector गायब है” को भी crash
नहीं, data मानता है: कोई ग़ैर-वैकल्पिक step miss होने पर run
`code: 'step-missed'` और selector का नाम बताने वाले कारण के साथ रुक जाती
है, इसलिए जिस site के लिए हमारे पास सिर्फ draft है, उस पर पहली
authenticated run ही ठीक-ठीक बता देती है कि क्या सुधारना है।

## 8. इस्तेमाल कैसे करें

```bash
# क्या-क्या supported है, और उसमें कितना verified है
meta-sovereign cv-platforms
meta-sovereign cv-plan --platform=linkedin

# profiles को local store में पढ़ें (browser खुलता है)
meta-sovereign cv-read --platforms=linkedin,hh --login=anna --artifacts=./cv-runs

# जो पहले से सहेजा है उसकी तुलना करें — browser की जरूरत नहीं
meta-sovereign cv-diff --prefer=linkedin

# मिलान की योजना बनाएँ; असल में लिखने के लिए --apply जोड़ें
meta-sovereign cv-sync --platforms=linkedin,hh,naukri
meta-sovereign cv-sync --platforms=linkedin,hh,naukri --apply

# सिर्फ एक field लिखें, या सिर्फ एक editor group
meta-sovereign cv-sync --platforms=linkedin --paths=basics.headline --apply
meta-sovereign cv-sync --platforms=linkedin --groups=intro --apply

# किसी run के दौरान क्या हुआ
meta-sovereign cv-telemetry --type=step.miss
```

किसी platform के लिए पहली `cv-read` दिखने वाला browser खोलती है
(`--headed`), उपयोगकर्ता एक बार sign in करता है, और session हर platform के
अलग profile directory (`--profile=<dir>`) में रह जाती है। आगे की runs उसी
का पुन: उपयोग करती हैं। यह repository credentials कभी माँगती, सहेजती या
भेजती नहीं है।

यही operations HTTP पर (`/api/cv/platforms`, `/plan`, `/stored`, `/read`,
`/compare`, `/sync`, `/telemetry`) और SPA के **CV** screen पर भी उपलब्ध
हैं, जो platforms को उनकी draft गिनती के साथ सूचीबद्ध करता है, तुलना matrix
दिखाता है, और browser tab से live read चलाने से मना कर देता है — एक browser
दूसरे browser को drive नहीं कर सकता, इसलिए SPA CLI की ओर भेज देता है।

## 9. Testing

| स्तर               | क्या चलता है                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | Model, diff, plan validation, runner, telemetry — नकली commander के साथ।                                                                                 |
| Fixture            | `js/tests/helpers/markup-fixture.js` हर plan का अपेक्षित DOM खुद plan से बनाता है।                                                                       |
| Browser (वैकल्पिक) | `RUN_BROWSER_E2E=1 npm run test:e2e:cv` इन fixtures को Playwright interception से platforms के अपने URL पर परोसकर सातों plans असली Chromium से चलाता है। |

Fixture generator ही browser test को सार्थक बनाता है: वह page को plan के
selectors से निकालता है, इसलिए plan और उसका fixture अलग नहीं हो सकते, और
e2e उसी path को जाँचता है जो असल में भेजा जाता है — `openBrowserSession` →
browser-commander → runner → telemetry — न कि उसके किसी mock को।
