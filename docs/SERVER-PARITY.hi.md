# Server parity matrix — JS server vs. Rust server (languages: [en](SERVER-PARITY.md) • [zh](SERVER-PARITY.zh.md) • hi • [ru](SERVER-PARITY.ru.md))

यह page JavaScript server (`js/src/server/index.js` + `routes-*.js`) और
pure-Rust server (`rust/crates/meta-sovereign-server/src/routes.rs` +
`handlers.rs`) के HTTP routes और transport surfaces गिनता है ताकि user
backend चुनते समय feature parity समझ सके।

Rust server preferred local backend है: single binary, no runtime,
fastest cold start। JS server fallback है: आज अधिक features देता है और
Bun/Node/Deno वाले environment में चलता है।

| Status    | Meaning                                      |
| --------- | -------------------------------------------- |
| Parity    | दोनों servers same route और wire shape देते। |
| JS only   | JS server में है, Rust में अभी नहीं।         |
| Rust only | Rust server में है, JS में नहीं।             |

## 1. Links routes

`/links` और `/links/:id` के GET/PUT/DELETE दोनों servers पर parity हैं।
`?include=tombstones`, `?showDeleted=1`, `?purge=1&confirm=1` का behavior
same है।

## 2. Derived read routes

`/api/contacts`, `/api/status`, `/api/autocomplete`, `/api/audience`,
`/api/facts`, `/api/search`, `/api/health`, `/sources` और `/metrics`
दोनों servers पर parity में हैं।

## 3. Mutating CRUD routes

patterns, graphs, replies, profile, resume, broadcast और
`/api/email/pull` / `/api/email/send` wire parity रखते हैं। Rust email
routes JS जैसा archive ingest envelope accept करते हैं। Live Gmail,
Microsoft Graph, JMAP और raw IMAP/POP3/SMTP अभी JS server features हैं,
क्योंकि Rust crate `std`-only रहता है।

## 4. Outreach, backups, hardening

`/api/outreach`, `/api/backups`, `/api/backups/restore`,
`/api/export-encrypted` और `/api/links/purge-tombstones` अभी JS only हैं।
Rust server `404` दे तो SPA related features hide या fallback करता है; CLI
local JS implementation से चलता रहता है।

Browser auto-import (`/api/auto-import`, `/api/auto-import/jobs/:id`,
`/capture`, `/stop`) JS only है: यह browser-commander (Node library) से
browser चलाता है। Rust server के साथ Connections panel बताता है कि JS
server चाहिए; manual archive import काम करता रहता है।

## 5. CV synchronisation

`/api/cv/platforms`, `/api/cv/plan`, `/api/cv/stored`, `/api/cv/read`,
`/api/cv/compare`, `/api/cv/sync` और `/api/cv/telemetry` (R-V16) JS only
हैं, और इसकी वजह structural है: `read` तथा `sync` `browser-commander` +
Playwright से असली browser चलाते हैं, जबकि Rust crate सिर्फ `std` पर है
और ऐसा process शुरू नहीं कर सकता। बाकी चार routes browser को छूते ही
नहीं, इसलिए portable हैं; तब तक SPA का CV screen खाली table के बजाय साफ
कहता है कि "JS server चाहिए"। विवरण:
[`docs/CV-SYNC.hi.md`](./CV-SYNC.hi.md)।

## 5a. Automations, people, sending और suggestions

| Route                                           | Method           | JS server                             | Rust server | Status      |
| ----------------------------------------------- | ---------------- | ------------------------------------- | ----------- | ----------- |
| `/api/automations`                              | GET, PUT         | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/<id>`                         | DELETE           | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/presets`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/plan`                         | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/run`                          | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts`                       | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/drafts/{send,form,mark,skip}` | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/automations/history`                      | GET              | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/send`                                     | POST             | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/typing`                                   | GET, POST        | `js/src/server/routes-automations.js` | _missing_   | **JS only** |
| `/api/people`, `/api/people/xref`               | GET              | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences`, `/api/lists`                  | GET, PUT, DELETE | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/audiences/resolve`                        | POST             | `js/src/server/routes-people.js`      | _missing_   | **JS only** |
| `/api/suggest`, `/api/suggest/stats`            | GET              | `js/src/server/routes-suggest.js`     | _missing_   | **JS only** |

ये routes (issue #31 और PR #34, R-X6..R-X18) `js/src/automation/`,
`js/src/crm/people.js` और `js/src/replies/` पर पतली परत हैं। SPA पहले
server से पूछता है, क्योंकि उसके पास सभी imported archives और adapters
के credentials होते हैं; server न हो तो वही code browser में पहले से
मौजूद links पर चलता है (`js/src/web/automation-api.js`): offline भी यह
automations की list दिखाता है, उन्हें edit और preview करता है, safe-mode
drafts को उनके chats में रखता है, लोगों को खोजता है, audiences resolve
करता है और जवाब सुझाता है। Server सिर्फ़ संदेश पहुँचाने के लिए चाहिए;
server के बिना chat composer में लिखा संदेश browser में तब तक रखा रहता
है जब तक कोई server उसे sync न कर दे। `automations` CLI command बिना
किसी server के चलता है।

**दूसरी सेवाओं में लिखने के लिए पुष्टि ज़रूरी है।** हर रूट जो किसी
दूसरी सेवा पर कुछ भेजता, पोस्ट करता या बदलता है — `/api/send`,
`/api/automations/run` (auto मोड), `/api/automations/drafts/send`,
`/api/email/send`, `/api/github/post-comment`,
`/api/upwork/post-message`, `/api/peopleperhour/post-message`,
`/api/broadcast`, `/api/outreach` (`mode: "queue"`),
`/api/greetings/plan` (`run: "queue"`), `/api/cv/sync` (`dryRun: false`),
`/api/profile/sync` और `/api/resume/sync` — पहले `428 Precondition
Required` के साथ `{ needsConfirmation, action, preview, confirm: { token,
expiresAt } }` लौटाता है और कुछ नहीं करता। क्लाइंट पूर्वावलोकन दिखाता है
और वही बॉडी `confirmToken` के साथ दोहराता है; टोकन एक बार चलता है, उसी
बॉडी से बँधा है, पाँच मिनट तक मान्य है, और सर्वर ठीक वही योजना चलाता है
जो दिखाई गई थी (`js/src/server/confirmations.js`)। CV का ड्राई रन अपनी
योजना लागू करने का टोकन पहले से साथ लाता है। `PUT /api/profile` और `PUT
/api/resume` सिर्फ़ सहेजते हैं; `broadcast:*`, `outreach:*`, `profile:*`
या `resume:*` लिंक को सहेजने या सिंक करने से कुछ नहीं भेजा जाता। `/ws`
और `/rtc` CORS सूची से बाहर के origin से WebSocket अस्वीकार करते हैं।
Rust सर्वर में ये रूट नहीं हैं, इसलिए वहाँ SPA "सर्वर चाहिए" बताता है।

## 6. अभिवादन

`/api/greetings/catalogue`, `/api/greetings/selection` (GET और PUT),
`/api/greetings/stickers`, `/api/greetings/plan` और `/api/greetings/file`
(issue #35) JS only हैं; ये
[`docs/GREETINGS.hi.md`](./GREETINGS.hi.md) वाली "अभिवादन" screen चलाते
हैं। `catalogue`, `selection` और `plan` preview सिर्फ catalogue और store
पर निर्भर हैं, इसलिए portable हैं; `stickers`, queued `plan` और `file` JS
source adapters से VK, Telegram, WhatsApp और Messenger APIs बुलाते हैं।
इनके बिना SPA built-in catalogue और preview दिखाता है, और भेजना
`meta-sovereign greetings-*` CLI से होता है। दोनों servers एक ही CSP भेजते
हैं: `img-src` में `https://vk.com` है ताकि VK sticker previews सीधे VK से
आएँ; Telegram thumbnails के download URL में bot token होता है, इसलिए वे
`/api/greetings/file` से proxy होते हैं।

## 7. Real-time transports और static assets

`/ws` WebSocket sync और `/rtc` WebRTC signalling दोनों servers पर parity
में हैं। `/`, `/index.html`, flat assets, `/storage/`, `/handlers/` और
`/sync/` mounts भी same static behavior रखते हैं और path traversal reject
करते हैं।

## 8. Summary

| Category                       | Routes | Parity | JS only |
| ------------------------------ | ------ | ------ | ------- |
| Read + derived + meta          | 14     | 14     | 0       |
| Mutating CRUD                  | 15     | 15     | 0       |
| Outreach / backups / hardening | 6      | 0      | 6       |
| CV synchronisation             | 7      | 0      | 7       |
| अभिवादन                        | 6      | 0      | 6       |
| Automations, लोग, suggestions  | 14     | 0      | 14      |
| Real-time transports           | 2      | 2      | 0       |
| Static asset serving           | 3      | 3      | 0       |
| **Total**                      | **67** | **34** | **33**  |

Rust server आज **51% route parity** पर है। Typical user flow - SPA खोलना,
contacts देखना, messages भेजना, replies automate करना, devices sync
करना, email archives ingest करना - Rust server को JS server का drop-in
replacement बना देता है।
