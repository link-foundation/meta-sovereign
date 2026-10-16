# Requirements (languages: [en](REQUIREMENTS.md) • [zh](REQUIREMENTS.zh.md) • hi • [ru](REQUIREMENTS.ru.md))

यह `meta-sovereign` का top-level requirements ledger हिंदी में है। Stable
`R-*` IDs, code symbols, routes, commands और file paths original form में
रखे गए हैं ताकि उन्हें अंग्रेजी [`REQUIREMENTS.md`](./REQUIREMENTS.md),
changesets, PRs और code comments से cross-reference किया जा सके।

हर issue की detailed breakdown [`docs/case-studies/`](./case-studies/) में
है। [`docs/ROADMAP.md`](./ROADMAP.md) reviewer-facing roadmap ledger के
रूप में मौजूद रहता है।

## A. Data layer

R-A1..R-A5 unified database import/export, `.lino` files, binary
Doublets + text store sync, automatic encrypted backups और indented Links
Notation preference cover करते हैं। State: done via `DualStore`,
`LinoTextStore`, backup scheduler और secret-link encryption।

## B. Unified communication UI

R-B1..R-B4 unified chat UI, previous outgoing messages से autocomplete,
operator DONE/NEXT workflow और cross-service broadcast UI मांगते हैं।
State: done in SPA views और `/api/*` routes।

## C. Pattern matching और reply automation

R-C1..R-C5 regex/PEG pattern editor, reply variation editor, n8n-style
graph automation, auto/semi-auto modes और multi-message fact extraction
cover करते हैं। State: done in patterns, facts, graph और reply surfaces।

## D. Personal CRM

R-D1..R-D6 contact detail aggregation, audience DSL, mass-personal
outreach, configurable search, profile sync और resume sync cover करते
हैं। State: done।

## E. External-service connectors

R-E1..R-E10 VK, Telegram, X, WhatsApp, Facebook, LinkedIn,
career.habr.com, hh.ru, superjob.ru और email के archive/live support की
मांग करते हैं। State: done; adapters data को unified links में normalize
करते हैं। R-E11..R-E13 Naukri, VietnamWorks और TopCV जोड़ते हैं: इनका
कोई public API नहीं है, इसलिए data exports और browser session से आता है
(section V देखें)।

## F. Distribution, sync, deployment

R-F1..R-F8 NPM library surface, CLI, Electron, local web server, WebRTC
sync, Docker microservices और server/client Universal Links API cover
करते हैं। State: done।

## G. Stack constraints

R-G1..R-G3 JS server/client + React UI + Rust/WASM heavy workloads,
pure-Rust alternative server और iOS/Android/Electron packaging cover करते
हैं। State: done।

## H. Quality, design, process

R-H1..R-H6 Apple/Material/Fluent UI guidance, simple code, automated API
docs, unit/integration/e2e coverage, CI/CD parity और Unlicense cover करते
हैं। State: done।

## I. Documentation deliverable (issue #1)

R-I1..R-I5 issue #1 case study, online research, requirements, solution
plan और components survey मांगते हैं। State: done।

## J. Maintainer directives from PR #2

R-J1..R-J11 offline browser storage, server autodiscovery,
WebRTC/WebSocket, handler-driven store API, handled stamps,
decentralized GitHub Pages deployment, browser-commander e2e, pure-Rust
server, requirements/roadmap ledger, single-PR completion और CI timeout
policy cover करते हैं। State: done।

## K. Hardening (issue #6)

R-K1..R-K20 soft delete, recoverable tombstones, explicit purge, sync
semantics, provider delete behavior, vault master key, multiple unlock
methods, encrypted exports, HTTP/CLI purge/export और issue #6 case study
cover करते हैं। State: done।

## L. Browser-first publishing (issue #8)

R-L1..R-L15 GitHub Pages SPA publishing, browser-first docs, Pages
workflow, server discovery, Rust/JS backend guidance, case study और CI/CD
alignment cover करते हैं। State: done।

## M. Newbie-friendly UI (issue #10)

R-M1..R-M18 connection guides, CORS-aware probes, theme toggle, tutorial
overlay, settings guidance, e2e coverage और issue #10 case study cover
करते हैं। State: done।

## N. Tutorial progress persistence (issue #13)

R-N1..R-N9 tutorial refresh persistence, Next/Skip/Complete persistence,
reopen reset, case study, external research और root-cause note cover करते
हैं। State: done।

## O. Email support (issue #3)

R-N1..R-N10 (historical numbering retained) email research, archive
import, Gmail/Microsoft Graph/JMAP live receive/send, IMAP/POP3/SMTP
local-server fallback, HTTP routes, CLI/API surface और reproducing tests
cover करते हैं। State: done।

## P. Provider connections (issue #16)

R-O1..R-O19 provider credential forms, archive upload/paste import,
settings surface, Connect first CTA, secret storage, probe
classification, CORS help, tests और issue #16 case study cover करते हैं।
State: PR #17 still in progress।

## Q. UI और documentation internationalisation (issue #18)

R-Q1..R-Q10 SPA language switcher, browser language detection, local
override persistence, `<html lang>`/`dir`, authored UI strings के
translation keys, dictionary parity tests, Markdown language switchers,
translated docs siblings, docs-language automation, issue #18 case study
और PR #19 single-PR delivery cover करते हैं। State: PR #19 in progress।

## U. Mobile-first UI overhaul (issue #25)

R-N1..R-N12 mobile-first AppShell (bottom-nav / side-rail / permanent
drawer), Apple Liquid Glass tokens जिनके साथ
`prefers-reduced-transparency` fallback है, पूरा translation coverage
(non-EN build में कोई English literal नहीं), अलग Connections page
(हर provider के लिए एक card और
`connected/not-connected/action-required` state badge), dedicated setup
detail screen, per-provider `setupSteps[]`, element-anchored tutorial
spotlight, और "Connect a service" से शुरू होने वाला default tutorial
sequence cover करते हैं। State: PR #26 branch `issue-25-dac43a780b5c`
पर in progress। विस्तृत table के लिए
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section U देखें।

## V. Job platforms के बीच CV synchronisation (issue #29)

R-V1..R-V22 links notation में canonical CV model, cross-platform diff
और reconcile, सात platforms (LinkedIn, hh.ru, Habr Career, Naukri,
VietnamWorks, TopCV, SuperJob) के declarative browser plans,
verified/documented/draft steps गिनने वाला registry validation,
redaction तथा HTML/screenshot artifacts वाली telemetry,
browser-commander पर चलने वाला plan runner, facade / HTTP routes / CLI
commands / SPA screen, web bundle की शुद्धता, `--paths` और `--groups`
से चुनिंदा writes, fixture markup पर असली browser से हर plan का run, और
backend के पास `/api/cv/*` न होने पर दिखने वाला graceful degradation
cover करते हैं। State: PR #30 में done। विस्तृत table के लिए
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section V देखें; काम कैसे
करता है यह [`docs/CV-SYNC.hi.md`](./CV-SYNC.hi.md) में है।

## W. Kate Mobile पर रोक के बाद VK token स्रोत (issue #32)

R-W1..R-W5 cover करते हैं: vkhost.github.io के सभी clients की VK के मौजूदा
OAuth gate पर जाँच, `VK_TOKEN_SOURCES` catalogue जिसमें VK के अपने clients
छोटे third-party publishers से पहले आते हैं, पहले से मौजूद token को केवल
documented methods से जाँचने वाला `inspectVkToken()`, चारों locales में सुधारा
गया VK hint, और connector का `api.vk.ru` domain पर जाना। State: PR #33।
विस्तृत table के लिए [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section W
देखें; research [`docs/case-studies/issue-32/`](./case-studies/issue-32/README.md) में है।

## X. Automations, audiences और chat (issue #31, PR #34)

नीचे की requirements
[issue #31](https://github.com/link-foundation/meta-sovereign/issues/31) —
"support messaging to all personal contacts we were not talking for
long" — और
[PR #34 review](https://github.com/link-foundation/meta-sovereign/pull/34)
से आती हैं, जिसमें अलग re-engage screen की जगह एक universal,
configurable automation माँगा गया था। Research, plan और screenshots
[`docs/case-studies/issue-31/`](./case-studies/issue-31/README.md) में हैं।

| ID    | Requirement                                                                                                     | State                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-X1  | हर निजी (1:1) संपर्क खोजना जिसके साथ कम से कम N दिन (default 90) से किसी भी दिशा में कोई संदेश नहीं हुआ।        | Done: `js/src/crm/reengage.js` में `findDormantContacts` संदेशों को chat के हिसाब से group करता है, सिर्फ़ निजी chats रखता है (adapter `chatType`, VK peer ranges, या ठीक एक दूसरा participant), groups, channels और bots छोड़ देता है, और default रूप से वे chats भी छोड़ता है जिनमें owner ने कभी नहीं लिखा। Automation की `silentDays` condition इसी का इस्तेमाल करती है। Tests: `js/tests/reengage.test.js`, `js/tests/automations.test.js`। |
| R-X2  | Issue के दो texts default हैं, और दोनों बदले जा सकते हैं।                                                       | Done: ये `reengage-dormant` preset के templates हैं (`defaultReengageTemplates`); हर automation के अपने editable informal और formal texts हैं, जिनमें `{name}`, `{days}` और `{network}` इस्तेमाल हो सकते हैं।                                                                                                                                                                                                                                    |
| R-X3  | Regex rules से पहचानना कि dialog में "ты" ज़्यादा इस्तेमाल हुआ या "вы"।                                         | Done: `js/src/crm/address-form.js` — Russian के लिए Unicode-aware whole-word markers (pronouns, possessives, verb forms, imperatives, greetings), साथ में 您/你 और आप/तुम; owner के अपने संदेशों का वज़न 2× है; बड़ा score जीतता है। Tests: `js/tests/address-form.test.js`।                                                                                                                                                                     |
| R-X4  | Detection rules बढ़ाए जा सकते हैं।                                                                              | Done: `rules` option, और Patterns screen के `address:informal` / `address:formal` label वाले `pattern:*` links अतिरिक्त rules बन जाते हैं (`addressRulesFromPatterns`)।                                                                                                                                                                                                                                                                          |
| R-X5  | पहचाना गया रूप समझाया जा सके और उसका safe default हो।                                                           | Done: हर draft के साथ उसका रूप और कारण (`majority`/`tie`/`no-evidence`) रहता है; सबूत न हो या बराबरी हो तो विनम्र "вы" वाला text इस्तेमाल होता है। Draft card, preview और `automations review` रूप दिखाते हैं और user को उसे बदलने देते हैं।                                                                                                                                                                                                     |
| R-X6  | Safe (debug) mode default है: एक बार में एक pre-filled संदेश, जो user की पुष्टि के बाद ही भेजा जाता है।         | Done: `safe` mode (default) में automation सिर्फ़ `automation-draft:*` links queue करता है; हर draft अपने chat के draft card से या `automations review` से एक-एक करके भेजा जाता है, और server `confirm: true` के बिना draft send मना कर देता है। Tests: `js/tests/automation.test.js`, `js/tests/automations-server.test.js`।                                                                                                                    |
| R-X7  | Outreach एक configurable automation है, कोई अलग screen या chat नहीं।                                            | Done: `js/src/automation/automations.js` — trigger → audience → conditions → action, konard/vk-bot के triggers की तर्ज़ पर; issue #31 `reengage-dormant` preset है, job search, contract search और greet-back के साथ। स्वचालन tab इन्हें edit, preview और run करता है (`js/src/web/automations-view.js`)। Tests: `js/tests/automations.test.js`, `js/tests/automations-view.test.js`।                                                            |
| R-X8  | Automations हाथ से, schedule पर, आने वाले संदेश पर, या chat के menu से चलते हैं।                                | Done: trigger kinds `manual`, `schedule` (`every: "1d"`), `incoming` (एक regex) और `chat-menu`; scheduler server के साथ शुरू होता है (`createAutomationScheduler`); हर chat के header में स्वचालन menu है, जिसमें "इस चैट में परखें" (conditions अनदेखी) और "शर्तों के साथ चलाएँ" हैं।                                                                                                                                                           |
| R-X9  | Terminal में और HTTP पर वही automations।                                                                        | Done: `meta-sovereign automations` के साथ `list`, `plan <id>`, `run <id>`, `review`, `drafts`, `history`, `save` और `delete` (`js/src/cli/automation-commands.js`); `/api/automations`, `/api/automations/{plan,run,drafts,history}` और `/api/automations/drafts/{send,form,mark,skip}` (`js/src/server/routes-automations.js`)। Tests: `js/tests/automation-cli.test.js`, `js/tests/automations-server.test.js`।                                |
| R-X10 | किसी को गलती से दो बार संदेश न जाए।                                                                             | Done: हर run एक `automation-run:<automation>:<source>:<chat>` record (`sent`, `skipped` या `failed`) लिखता है और हर queued draft एक `automation-draft:*` link है; `cooldownDays` condition और pending drafts उन chats को बाहर रखते हैं, और preview बताता है कि हर व्यक्ति क्यों छोड़ा गया।                                                                                                                                                       |
| R-X11 | जब कोई adapter संदेश न भेज सके, तो उसे हाथ से भेजा जा सके।                                                      | Done: `prefillLinkFor` भरे हुए body के साथ `mailto:` (RFC 6068), `tg://user?id=` और `https://vk.com/im?sel=` देता है; draft card का "चैट खोलें" इसका इस्तेमाल करता है और "मैंने खुद भेज दिया" भेजना दर्ज करता है।                                                                                                                                                                                                                                |
| R-X12 | Automations searchable, cross-referenced लोगों पर चल सकते हैं।                                                  | Done: `js/src/crm/people.js` messages, `person:`, `member:` और `list:` links को हर network account के लिए एक entry में समेटता है, `sameAs` cross references के साथ; `/api/people` उन्हें खोजता है; स्वचालन tab लोगों को चुनता है, उन पर चलाता है या उन्हें list के रूप में सहेजता है। Tests: `js/tests/people.test.js`।                                                                                                                          |
| R-X13 | Audiences friends, chats, communities और lists को union, intersection और difference से जोड़ते हैं।              | Done: `js/src/crm/people.js` में `resolveAudience` और `parseAudienceSpec` — `friends:vk & chat:vk:2000000001 - list:blocked` जैसे specs, जो `audience:*` links के रूप में सहेजे जाते हैं और count के साथ resolve होते हैं; VK friends, chat और community members (और Bot API जिन Telegram chat members को दिखाता है) `member:` links के रूप में sync होते हैं। Tests: `js/tests/people.test.js`।                                                 |
| R-X14 | Message-to-message reply links से autocomplete, frequency के क्रम में, फिर हमारे अपने संदेशों से शब्द-दर-शब्द।  | Done: `js/src/replies/reply-graph.js` archive से और real time में prompt → reply edges सीखता है; `/api/suggest` chat के आख़िरी आने वाले संदेश पर पूरे, deduplicated जवाब use count के क्रम में देता है, फिर owner के संदेशों से शब्द-दर-शब्द continuations; composer उन्हें chips के रूप में दिखाता है (Tab पहला लेता है)। Tests: `js/tests/reply-graph.test.js`, `js/tests/reply-service.test.js`।                                              |
| R-X15 | तेज़ reply lookups के लिए link-cli इस्तेमाल करें।                                                               | Done: `js/src/replies/reply-store-clink.js` reply graph को `clink --serve` में mirror करता है (`MS_REPLY_CLINK=1`) और कभी किसी keystroke को नहीं रोकता; lookup की लागत `experiments/clink-*.mjs` से मापी जाती है। Tests: `js/tests/reply-store-clink.test.js`।                                                                                                                                                                                   |
| R-X16 | Storage, import और export associative stack इस्तेमाल करते हैं: Links Notation text और link-cli binary doublets। | Done: `js/src/storage/doublets-archive.js` link-cli store archive layout लिखता है, इसलिए वही file `clink` में import होती है; `js/src/storage/lino-store.js` हर line पर एक Links Notation record लिखता है। Tests: `js/tests/doublets-archive.test.js`।                                                                                                                                                                                           |
| R-X17 | हर messenger में typing status, लोगों और automations दोनों के लिए।                                              | Done: VK `messages.setActivity` और long-poll typing events, Telegram `sendChatAction`, WhatsApp typing indicators और web UIs; `typing:*` links expire हो जाते हैं; chat header दिखाता है कि कौन लिख रहा है, user की ओर से लिख रहा automation भी, और user के लिखते समय हमारी typing भेजी जाती है। Tests: `js/tests/live-links.test.js`, `js/tests/chat-view.test.js`।                                                                             |
| R-X18 | जब API न भेज सके, तो browser-commander से official web UI के ज़रिए भेजें।                                       | Done: `js/src/sources/browser-sender.js` — पहले API, फिर vk.com, web.telegram.org या web.whatsapp.com, जिन्हें browser-commander असली key events से चलाता है; signed-out UI `login-required` के रूप में report होता है। Tests: `js/tests/browser-sender.test.js`।                                                                                                                                                                                |
| R-X19 | Chat default रूप से t3.codes जैसा दिखे, Telegram जैसे विकल्प के साथ, React में।                                 | Done: `js/src/web/chat-view.js` — तारीख़ के हिसाब से grouped searchable sidebar, बीच में message column, floating composer; सेटिंग्स → रूप-रंग `js/src/web/appearance.js` और `app.css` में skins (t3, Telegram, WhatsApp, Signal) बदलता है। Tests: `js/tests/chat-view.test.js`, `js/tests/appearance.test.js`।                                                                                                                                  |
| R-X20 | Themes: system, light, dark और auto।                                                                            | Done: `resolveTheme` OS (`prefers-color-scheme`), एक तय choice, या समय (light 07:00–19:00) के अनुसार चलता है; header button अब भी light/dark पलटता है। Tests: `js/tests/appearance.test.js`।                                                                                                                                                                                                                                                     |
| R-X21 | हर dependency अपने latest release पर हो।                                                                        | Commit `chore(deps)` में done: npm packages और GitHub Actions update हुए; ESLint 10 और jscpd 5 fixes।                                                                                                                                                                                                                                                                                                                                            |

## Y. Telegram credential finder और shared UI conventions

ये requirements "Find Telegram sessions on this computer" finder
(Telegram → Enter manually) बनाते समय maintainer directives से आई हैं।
इन्हें durable conventions के रूप में लिखा गया है ताकि बाद का काम इन्हें हर
लागू जगह पर apply करे, न कि हर screen पर दोबारा खोजे। हर एक app की हर लागू
surface पर **uniformly** लागू होती है।

| ID    | Requirement                                                                                                                                                                                                                          | State                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R-Y1  | Finder केवल proven-live credentials दिखाता है: Telegram जिस token/session को actively reject करता है वह drop होता है; जिसे check नहीं किया जा सका (network/timeout) वह unverified mark के साथ रखा जाता है।                           | Done: `js/src/sources/auto-import/telegram-creds.js` में `verifyRecord`/`isDeadError`; `scan` `active !== false` filter करता है।            |
| R-Y2  | Credentials account से deduplicate होते हैं और हर type के लिए एक connectable entry में collapse होते हैं (login by session, bot token, login by phone & password) — कभी हर file की एक row नहीं।                                      | Done: `dedupeRecords` + `groupRecords`/`mergeRecords`; `js/tests/telegram-creds.test.js` में tested।                                        |
| R-Y3  | User accounts bot accounts से पहले list होते हैं।                                                                                                                                                                                    | Done: `groupRecords` account kind से stable-sort करता है (user 0, bot 1); test "user accounts are listed before bot accounts"।              |
| R-Y4  | Credential जहाँ-जहाँ मिला वह हर जगह रखी जाती है; सबसे छोटा path पहले दिखता है और बाकी locations "+N more" / "Show less" toggle के पीछे expand होते हैं।                                                                              | Done: finder `byLength` `wheres` sort करता है; `js/src/web/connections/telegram-sessions.js` में `WhereLine` expandable list है।            |
| R-Y5  | Masked hints token/session के अधिकतम पहले तीन और अंतिम तीन characters दिखाते हैं (छोटे values tail-only mask पर fall back करते हैं); raw secret values कभी machine से बाहर या logs में नहीं जाते।                                    | Done: `maskEnds`/`maskHint`; हर जगह BigInt-safe JSON; values कभी browser को return या log नहीं होते।                                        |
| R-Y6  | Credential connect करने पर हमेशा explicit visible feedback ("Connected" mark) मिलता है — successful click कभी silent नहीं होता।                                                                                                      | Done: `useFinder` में `connected` state; entry अपने button को check-marked "Connected" badge से बदल देती है।                                |
| R-Y7  | Verification states ("confirmed with Telegram") एक छोटे check-mark icon के रूप में render होते हैं जिसके शब्द उसके tooltip (`title` + `aria-label`) में रहते हैं, shared `VerifiedMark` के ज़रिए, जहाँ भी confirmed credential दिखे। | Done: `VerifiedMark` + `js/src/web/icons.js` में `check` icon; `app.css` में `.verified-mark`।                                              |
| R-Y8  | Persistent chrome (top menu bar) हमेशा transient overlays के ऊपर रहता है: tutorial spotlight ring और उसका dimming header के bottom edge पर clip होते हैं और कभी top menu के ऊपर float नहीं करते।                                     | Done: `.topbar.glass` `z-index: 2001` पर है, `z-index: 2000` tutorial overlay से ऊपर; कोई tutorial step header control को target नहीं करता। |
| R-Y9  | App folder में verbose server logs by default on हैं, हर request और हर error को उसके stack के साथ capture करते हैं, ताकि किसी भी failure का root cause पहले से disk पर हो।                                                           | Done: `createServerLog`/`installCrashLogging` `<store>/logs/meta-sovereign.log` लिखते हैं; `--quiet-logs` opt-out।                          |
| R-Y10 | Generated artefacts (जैसे `CHANGELOG.md`) copy-paste duplication gate से बाहर रखे जाते हैं, ताकि release automation उसे trip न करे; gate केवल authored source मापता है।                                                              | Done: `**/CHANGELOG.md` `.jscpd.json` के `ignore` में है।                                                                                   |

## Traceability

Future PR या commit feature land करे तो changeset और PR description में
matching `R-*` ID reference करें, ताकि यह list live spec बनी रहे।
