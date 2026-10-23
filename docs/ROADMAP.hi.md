# रोडमैप (languages: [en](ROADMAP.md) • [zh](ROADMAP.zh.md) • hi • [ru](ROADMAP.ru.md))

## अभी कोई open tracked roadmap item नहीं है

issue #1 roadmap अभी खाली है। Original issue और PR #2 maintainer
follow-ups से निकाली गई हर requirement
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) में tracked है और हर row
implementation evidence के साथ Done है।

यह file PR #2 में मांगी गई reviewer-facing roadmap ledger के रूप में
रखी गई है। Review के दौरान नया gap मिले तो related requirement को Done
mark करने से पहले matching requirement ID के साथ उसे यहां add करें।

Telegram क्लाइंट की कौन-सी सुविधाएँ समर्थित, आंशिक, रोकी हुई या असमर्थित हैं,
यह [`docs/FEATURES.hi.md`](./FEATURES.hi.md) में दर्ज है।

## Audit के बाद के काम (R-Z)

तैयार काम के audit में कमियाँ मिलीं। उन्हें दो waves में बाँटा गया है। Wave 1 **चल रही है**, पूरी नहीं हुई। Wave 2 **planned है, शुरू नहीं हुई**। यहाँ कुछ भी वादा या तारीख़ नहीं है।

### Wave 1 — चल रही है

- R-Z1: local server को मज़बूत करना।
- R-Z2 (पूरा): store, backups, सहेजे secrets और logs को ज़्यादा सुरक्षित बनाना।
- R-Z3 (पूरा): automated भेजने को ज़्यादा सुरक्षित बनाना।
- R-Z4 (पूरा): भेजने और sync के नतीजे सच्चे बनाना (LinkedIn पर ग़लती से public post नहीं, CV sync की झूठी सफलता नहीं, X direct messages, साफ़ fallback)।
- R-Z5 (पूरा): email ठीक करना (सुरक्षित भेजना, सही पार्सिंग और थ्रेडिंग, सत्यापित TLS, क्रमिक पुल, लाने का बटन)।
- R-Z6: CI हरा करना (Deno, Bun, Windows, `cargo test`, CI में browser e2e)।

### Wave 2 — planned, अभी नहीं

- R-Z7: ऐसा code जोड़ना जो मौजूद है पर कभी चलता नहीं: automatic backup schedule, हटाए गए messages के tombstones (देखना, वापस लाना, purge), audience membership sync, Upwork और PeoplePerHour का 24 घंटे का cache purge, tutorial का Skip button, और refresh tokens जो सहेजे जाते हैं पर इस्तेमाल नहीं होते।
- R-Z8: GitHub, Upwork और PeoplePerHour के लिए inbox pull (email R-Z5 में है), और VK live updates, history paging, media और reactions को ठीक करना।
- R-Z9: personal WhatsApp: WhatsApp Web के लिए दिखने वाली sign-in window (QR), स्थिर chat ids, बेहतर archive parser, terms-of-service notice।
- R-Z10: Facebook, Instagram, X और LinkedIn के archive imports: टकराते ids, बिगड़ा text, छूटे attachments, reactions और participants ठीक करना।
- R-Z11: GitHub: messages edit, delete और react करना, review comments, notifications, incremental pull, discussions, repositories की सूची।
- R-Z12: pages में एकरूपता: 16 dialogs में Escape और focus, जो errors अभी छिप जाते हैं उन्हें दिखाना, credentials browser test ठीक करना।
- R-Z13 (पूरा): docs: चार भाषाओं में हर system के feature matrices, ru, hi और zh requirements में छूटे R, S और T sections, दोहराए R-N ids, README का npm दावा, यह roadmap, `MS_SECRET_PASSPHRASE`, और Rust server की ईमानदार सीमाएँ।

### अभी नहीं कर रहे

- Package को npm पर publish करना (owner चाहिए)।
- असली accounts पर web selectors की जाँच (असली accounts चाहिए)।
- WebAuthn और TOTP unlock।
- Rust server का JS server के बराबर होना: सिर्फ़ documented है, देखें [`docs/SERVER-PARITY.hi.md`](./SERVER-PARITY.hi.md)।

## बंद scope

बंद implementation history
[`docs/case-studies/issue-1/solution-plan.md`](./case-studies/issue-1/solution-plan.md)
में है। अंतिम PR #2 state local-first dual storage, `.lino`
import/export, encrypted backups, connectors, React SPA, browser storage,
server autodiscovery, WebSocket/WebRTC sync, Electron, mobile packaging,
Docker deployment, pure-Rust server parity और unit/integration/Rust/browser
e2e coverage को cover करती है।
