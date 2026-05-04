# परिवर्तन लॉग (languages: [en](CHANGELOG.md) • [zh](CHANGELOG.zh.md) • hi • [ru](CHANGELOG.ru.md))

यह हिंदी पाठकों के लिए रिलीज इतिहास है। संस्करण, commit hash, command
नाम और API नाम मूल रूप में रखे गए हैं ताकि उन्हें npm, GitHub Releases
और अंग्रेजी [`CHANGELOG.md`](./CHANGELOG.md) से मिलाया जा सके।

## 0.13.0

### Minor Changes

- R-N1..R-N10: email को first-class source बनाया गया: `.eml`/mbox
  import, browser-direct Gmail, Microsoft Graph और JMAP receive/send,
  Node local-server IMAP/POP3/SMTP transport, local email routes, CLI
  commands, connection-guide copy और issue #3 case study। pure-Rust
  server अब वही wire surface दिखाता है: `email` `/sources` में है और
  `/api/email/pull` + `/api/email/send` archive ingest और send queue के
  लिए समान JSON envelopes स्वीकार करते हैं।

## 0.12.0

### Minor Changes

- R-M1..R-M18: हर खाली SPA section को connection guide से बदला गया,
  CORS-aware direct API probe और same-origin server fallback जोड़ा गया,
  और step-by-step tutorial overlay दिया गया।
- R-N1..R-N9: tutorial की current step और completed state
  `metaSovereignTutorial` में persist होती है, इसलिए refresh के बाद
  tutorial step 1 से शुरू नहीं होता।

## 0.11.0

### Minor Changes

- R-L1..R-L15: browser में direct चल सकने वाली features को GitHub
  Pages पर publish किया गया, user-friendly docs फिर से लिखे गए, और
  CI/CD parity audit पूरा हुआ।
- `docs/USER-GUIDE.md`, `docs/SERVER-PARITY.md` और issue #8 case study
  जोड़े गए; JavaScript code/tooling `js/` में गया और Rust workspace
  अलग रहा।

## 0.10.0 और पुराने

पुराने releases ने local-first आधार बनाया: dual storage, `.lino`
import/export, encrypted backups, soft delete, GitHub Pages publishing,
WebRTC/WebSocket sync, React SPA, Electron/Capacitor shells, pure-Rust
server और cross-runtime test matrix। पूरी generated history अंग्रेजी
[`CHANGELOG.md`](./CHANGELOG.md) में है; यह localized file उपयोगकर्ता
के लिए आवश्यक सार रखती है और generated release log की हर internal
entry को नहीं दोहराती।
