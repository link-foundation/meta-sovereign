# CI और रिलीज़ की जाँच (भाषाएँ: [en](CI-OPERATIONS.md) • [zh](CI-OPERATIONS.zh.md) • hi • [ru](CI-OPERATIONS.ru.md))

R-Z32 के अनुसार प्रकाशित स्रोत की जाँच और विफलता के प्रमाण सुरक्षित होने चाहिए। [issue 43 का अध्ययन](case-studies/issue-43/README.md) मूल लॉग और टेम्पलेट तुलना देता है।

## स्थानीय जाँच और CI

`npm ci` से निर्भरताएँ स्थापित करें। स्थानीय रूप से केवल बदली फ़ाइलों की lint जाँच और संबंधित टेस्ट `--test-concurrency=1` के साथ चलाएँ। पूरी Node/Bun/Deno तथा OS मैट्रिक्स, Chromium, macOS पर WebKit, Rust और डेस्कटॉप पैकेजिंग GitHub CI में चलती हैं। टेस्ट अस्थायी स्टोर और अलग सर्वर इस्तेमाल करते हैं; उपयोगकर्ता के चलते सर्वर से उन्हें अलग रखें।

दोनों ब्राउज़र `js/scripts/browser-checks.json` का समान प्रतिनिधि समूह चलाते हैं, जिसमें recovery भी है। आवश्यक ब्राउज़र का न मिलना, टेस्ट विफल होना या समयसीमा पार होना जॉब को विफल करता है। टेस्ट प्रक्रिया शुरू होने पर ही उसके artifacts अपलोड होते हैं; पहले की merge/install त्रुटि मुख्य कारण रहती है।

दो लाख रिकॉर्ड का backup टेस्ट केवल अलग CI जॉब में `RUN_BACKUP_STRESS=1` और 384 MiB V8 heap सीमा के साथ चलता है। सामान्य टेस्ट इसे छोड़ते हैं। उपयोगकर्ता की मशीन पर stress टेस्ट न चलाएँ।

## विफल रन समझना

पहले रन का समय और head SHA नवीनतम कमिट से मिलाएँ। `gh run view RUN_ID --log > run.log` से लॉग रखें और असफल चरण पढ़ें। टेस्ट की त्रुटि, API का इनकार, गायब रिपोर्ट और रद्द पुराने रन में अंतर करें। `experiments/issue43-runs.py` इस अध्ययन के रन और annotations सहेजता है।

पैकेज जाँच खाली cache वाली स्थापना और startup को अलग करती है। npm लॉग तथा प्रक्रिया का अंतिम output `artifacts/pack/` में हैं। ब्राउज़र के प्रत्येक suite का लॉग और `summary.json`, `artifacts/browser/` में हैं। Wayback की प्रति मूल टूटी लिंक को सफल नहीं बनाती; स्रोत लिंक सुधारें। गायब या गलत रिपोर्ट भी त्रुटि है।

विस्तृत निदान मूल रूप से बंद है। repository variable `CI_BROWSER_DEBUG=1` Playwright trace देता है; `CISCRIPTS_DEBUG=1` या GitHub runner/step debugging helper loading दिखाता है; `PACK_SMOKE_VERBOSE=1` पैकेज स्थापना/startup दिखाता है। केवल नकली डेटा लें; token, session, निजी संदेश या credentials कभी लॉग न करें।

## प्रकाशन की शर्तें और recovery

प्रकाशन अंतिम pipeline gate की प्रतीक्षा करता है। केवल पढ़ने वाली जाँच पुराने रन रद्द करती है; रिलीज़ लेखन क्रम से और बिना cancellation होता है। जाँचे गए कमिट के बाद केवल version/changelog/changeset metadata आगे बढ़ सकता है। स्रोत या निर्भरता बदलने पर नया सफल CI चाहिए।

npm के लिए Node 24 का bundled npm कम से कम 11.5.1, `id-token: write` और `link-foundation/meta-sovereign` के `release.yml` workflow का trusted publisher चाहिए। ज़रूरत होने पर package administrator npm में package/publisher की शुरुआती स्थापना करे। token exchange का इनकार मिलने पर बिना जाँच publish न करें।

**Settings → Security → Code security → Dependency graph** चालू करें। PR में capability न होने की सूचना बिना contributor secrets के मिलती है। `main` पर dependency graph या npm publisher न होने पर preflight महँगी build से पहले स्पष्ट निर्देश देकर विफल होता है। network/authentication और गलत API response त्रुटियाँ हैं।

केवल सही version response या स्पष्ट npm E404/GitHub 404 उपलब्धता बताता है; बाकी स्थिति अज्ञात है। केवल पहचानी अस्थायी network/server त्रुटियों में साझा समयसीमा के अंदर retry होता है। staged version के लिए दोबारा upload किए बिना visibility जाँची जाती है; permission/policy का इनकार तुरंत रुकता है। npm पर मौजूद version का गायब GitHub release दोबारा npm publish किए बिना बन सकता है।

## निर्भरता नीति

Release helpers manifest और lockfile में pinned हैं। Telegram का maintained `teleproto` client और compatibility layer इस्तेमाल होता है; provider की पहचान `telegram` रहती है। KaTeX patched है। समीक्षा किए native install scripts npm, Bun और Deno में स्पष्ट रूप से स्वीकृत हैं।

`electron-builder` को `27.0.0-alpha.13` पर pin किया है क्योंकि 26.x में deprecated dependencies बची हैं। यह build tool का prerelease है और हर native packaging target को CI पास करना चाहिए; runtime package की Node सीमा नहीं बदलती। warnings न छिपाएँ और असंगत major overrides न करें। lockfile regression deprecated entries रोकता है।

v27 बिल्डर का नया कॉन्फ़िगरेशन पैकेज की वही फ़ाइलें, नेटिव मॉड्यूल नीति, desktop प्रविष्टि और macOS अनुमतियाँ रखता है। Ad-hoc हस्ताक्षर में `mac.sign.identity` और `mac.sign.sign` उपयोग होते हैं। मौजूदा updater 6 चैनल बिना हस्ताक्षर वाले अपडेट मैनिफ़ेस्ट और Windows आर्टिफ़ैक्ट स्पष्ट रूप से रखता है; Authenticode जाँच सक्षम करने के लिए हस्ताक्षर प्रकाशक कॉन्फ़िगर होना चाहिए। Staged updater में सीमित और सटीक npm alias अप्रचलित `lodash.isequal` को `lodash.isequalwith@4.4.0` से बदलता है। Customizer के बिना दोनों समान boolean deep comparison करते हैं। प्रत्येक इंस्टॉल वास्तविक updater cache में समान/बदले metadata और गायब फ़ाइल जाँचता है। Upstream सुधार के बाद override हटाएँ; पूरे `lodash` का alias wrapper लौटाता है और सुरक्षित नहीं है।

Windows Deno पर Telegram शुरू होने से पहले cifrante का मौजूदा WASM AES backend चुना जाता है: cifrante 0.6.0 में native IGE बनाना Deno 2.9.8 को `0xC0000005` से बंद करता है। अन्य runtime/OS का चयन बरकरार है। सीमित `experiments/issue43-cifrante.mjs` application path और encryption/decryption जाँचता है; `--raw-native` मूल crash दोहराता है। `CI_CRYPTO_DIAGNOSTICS=1` टेस्ट चरणों की tracing चालू करता है, जो सामान्यतः बंद है। कोई runtime या crypto assertion छोड़ा नहीं जाता।

Desktop, registry, mobile और package-smoke कमांड Windows npm/npx shim और argument escaping के लिए सटीक `cross-spawn@7.0.6` साझा करते हैं। Node में argument array के साथ `shell: true` DEP0190 देता है; साझा launcher `shell: false` रखता है और कमांड की विफलता बरकरार रखता है। Regression tests npm/npx को `--throw-deprecation` के साथ चलाते हैं और literal arguments तथा exit codes जाँचते हैं।

Pre-commit hook lint-staged को `--config package.json` देता है, ताकि संग्रहित template snapshot की configuration अपने आप न चले। Root ESLint/Prettier exclusions साक्ष्य को अपरिवर्तित रखते हैं। अस्थायी Git regression जाँचता है कि nested reference tasks न चलें और maintained files पर root checks लागू रहें।

GitHub test fixtures teardown पर अपने सभी connections बंद करते हैं, जिनमें keep-alive और अधूरे requests शामिल हैं; application server अलग रहता है। `CI_FIXTURE_DEBUG=1` connection count और shutdown समय दिखाता है (डिफ़ॉल्ट बंद)। Runtime job deadline बढ़ाने के बजाय fixture का connection cleanup ठीक किया गया है।

GitHub द्वारा macOS ARM runner बार-बार आवंटित न कर पाने के बाद Node और WebKit पिन किए गए मूल `macos-15-intel` पूल पर चलते हैं। Bun, Deno और desktop पैकेजिंग में macOS ARM कवरेज बना रहता है। सभी नौ runtime/OS संयोजन और दोनों ब्राउज़र जाँच अनिवार्य हैं; कतार में होना सफल जाँच नहीं है।
