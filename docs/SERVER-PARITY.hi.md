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

## 5. CV synchronisation

`/api/cv/platforms`, `/api/cv/plan`, `/api/cv/stored`, `/api/cv/read`,
`/api/cv/compare`, `/api/cv/sync` और `/api/cv/telemetry` (R-V16) JS only
हैं, और इसकी वजह structural है: `read` तथा `sync` `browser-commander` +
Playwright से असली browser चलाते हैं, जबकि Rust crate सिर्फ `std` पर है
और ऐसा process शुरू नहीं कर सकता। बाकी चार routes browser को छूते ही
नहीं, इसलिए portable हैं; तब तक SPA का CV screen खाली table के बजाय साफ
कहता है कि "JS server चाहिए"। विवरण:
[`docs/CV-SYNC.hi.md`](./CV-SYNC.hi.md)।

## 5a. पुराने contacts से दोबारा संपर्क

`/api/reengage/plan`, `/api/reengage/send`, `/api/reengage/mark` और
`/api/reengage/run` (issue #31, R-W9) JS only हैं; ये
`js/src/crm/reengage.js` पर पतली परत हैं। "फिर से जुड़ें" screen पहले
`/api/reengage/plan` से पूछता है, क्योंकि server पर सभी imported archives
होते हैं; server न हो तो वही planner browser में पहले से मौजूद links पर
चलता है। "मैंने खुद भेज दिया" और "छोड़ें" साधारण link writes हैं (local, और
server चालू हो तो `PUT /links` पर भी)। Server सिर्फ "भेजें" के लिए चाहिए,
क्योंकि भेजना credentials वाले source adapter से होता है। Server `404` दे
तो screen copy / chat खोलें / चिह्नित करें वाला रास्ता रखता है, और CLI का
`reengage` command बिना server के चलता है।

## 6. Real-time transports और static assets

`/ws` WebSocket sync और `/rtc` WebRTC signalling दोनों servers पर parity
में हैं। `/`, `/index.html`, flat assets, `/storage/`, `/handlers/` और
`/sync/` mounts भी same static behavior रखते हैं और path traversal reject
करते हैं।

## 7. Summary

| Category                       | Routes | Parity | JS only |
| ------------------------------ | ------ | ------ | ------- |
| Read + derived + meta          | 14     | 14     | 0       |
| Mutating CRUD                  | 15     | 15     | 0       |
| Outreach / backups / hardening | 6      | 0      | 6       |
| CV synchronisation             | 7      | 0      | 7       |
| Real-time transports           | 2      | 2      | 0       |
| Static asset serving           | 3      | 3      | 0       |
| **Total**                      | **47** | **34** | **13**  |

Rust server आज **72% route parity** पर है। Typical user flow - SPA खोलना,
contacts देखना, messages भेजना, replies automate करना, devices sync
करना, email archives ingest करना - Rust server को JS server का drop-in
replacement बना देता है।
