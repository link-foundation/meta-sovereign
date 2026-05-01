# External Research — Issue #1

The issue prescribes a number of upstream libraries (catalogued in `components.md`). For everything _not_ prescribed — local-first principles, CRDTs, unified messaging legality, encrypted-at-rest, pattern-synthesis literature, node editors, fuzzy search, browser SQLite, cross-platform shells — this document captures the publicly available information that informed the prototype's design.

All sources are public web pages. GitHub-hosted upstreams are listed in `components.md` instead.

## 1. Local-first software principles

The seminal essay _"Local-first software: You own your data, in spite of the cloud"_ (Kleppmann, Wiggins, van Hardenberg, McGranaghan; Ink & Switch, 2019) defines **seven ideals**: no spinners, multi-device, offline, collaboration, longevity, privacy, ownership. CRDTs are positioned as the foundational data structure for realising these ideals.

- Essay: <https://www.inkandswitch.com/essay/local-first/>
- Talk write-up: <https://martin.kleppmann.com/2019/10/23/local-first-at-onward.html>

Meta Sovereign maps directly onto the seven ideals — every requirement in `requirements.md` lands in one of them.

## 2. CRDTs and sync libraries

Two production-grade CRDT libraries dominate the JS ecosystem:

| Library       | Strengths                                                                                                                                                                           | Weaknesses                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Yjs**       | Fastest CRDT for collaborative text; YATA + binary encoding; mature WebRTC/WebSocket adapters.                                                                                      | Lower-level model — JSON document semantics are looser than Automerge's. |
| **Automerge** | Ergonomic JSON-document semantics; multi-language (Rust, JS, Swift, Java, Python); `automerge-repo` is the recommended high-level wrapper, ships network adapters including WebRTC. | Slightly larger payloads than Yjs in pure-text scenarios.                |

For Meta Sovereign:

- **Yjs** for the chat-text auto-completion buffer and any free-text editing surfaces.
- **Automerge** (via `automerge-repo`) for structured records — contact, group, fact, dialog graph nodes.

References:

- Yjs — <https://yjs.dev/>
- Automerge — <https://automerge.org/>
- Velt comparison — <https://velt.dev/blog/best-crdt-libraries-real-time-data-sync>

## 3. Personal CRM / Personal Knowledge Graph

[**Monica**](https://www.monicahq.com/) (docs: <https://docs.monicahq.com/>) is the leading open-source PRM (Laravel-based, self-hostable). Useful as a **schema reference** for the Sovereign import layer — it already models people, activities, reminders, debts, gifts, conversations.

For graph-style PKG, see Logseq / Athens-style projects. The Sovereign data model is _more_ than a PKG — it's a CRM + PKG hybrid — but the PKG community's experience around block-level addressing is informative.

## 4. Unified messaging — legality and architecture

Building "one client for every messenger" is a deeply ToS-sensitive area. The cleanest path is **Matrix bridges**:

- **Beeper bridges** (developer docs: <https://developers.beeper.com/bridges>) bridge WhatsApp, Telegram, Signal, X, LinkedIn, etc. into a single Matrix homeserver. Bridges are open source under [`mautrix`](https://github.com/mautrix) and the `bridge-manager`.
- **Element** (<https://element.io/>) is the reference Matrix client.
- For Meta Sovereign: a self-hosted Matrix homeserver + mautrix bridges is a viable backend that keeps the user's data **on their machine** and lets the Sovereign UI consume the Matrix Client-Server API directly.

This does not preclude direct importers (VK takeout, Telegram takeout, etc.) — those remain useful for archival and for networks without good Matrix bridges.

## 5. Pattern editor (regex / PEG inference)

There is no off-the-shelf interactive component for **example-driven regex/PEG inference**. Useful research baselines:

- **REGAE** — Glassman Lab, UIST'20. Interactive regex synthesis with augmented examples and corner-case generation. <https://glassmanlab.seas.harvard.edu/papers/ips_augex_uist20.pdf>
- **Sketch-Driven Regex Generation** — Chen et al., TACL. Combines NL + examples. <https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00339/96479/Sketch-Driven-Regular-Expression-Generation-from>
- **SplitRegex** — Neuro-symbolic regex synthesis. <https://arxiv.org/pdf/2205.11258>
- **Ohm-JS** — production PEG playground. Best fit for the PEG side of R-C1. <https://ohmjs.org/>

Realistic plan: build a pattern editor on top of Ohm-JS for PEGs and a small example-driven heuristic generator for regexes (escape literal text, infer character classes from the union of seen characters at each position). Defer real synthesis to a later milestone.

## 6. Fuzzy search in JavaScript

| Library        | Strengths                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Fuse.js**    | Bitap-based, zero deps, ideal for small/medium personal datasets and reply-template search. <https://www.fusejs.io/> |
| **MiniSearch** | Inverted-index full-text with prefix/phrase support. <https://lucaong.github.io/minisearch/>                         |
| **uFuzzy**     | Faster on large lists. <https://github.com/leeoniya/uFuzzy>                                                          |

Plan: hybrid stack — **MiniSearch** for tokenised full-text search across the whole message archive, **Fuse.js** for reply-variation fuzzy lookup (small lists, relevance scoring matters more than throughput).

## 7. Node editors in JS (n8n-like)

| Library        | Why                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rete.js v2** | Ships with a real dataflow / control-flow execution engine, not just visual canvas. Closest match to n8n's runtime model. <https://retejs.org/> |
| React Flow     | Most-adopted React-only library for visual canvas. Excellent rendering, no execution engine. <https://reactflow.dev/>                           |
| Drawflow       | Minimal vanilla-JS option. <https://jerosoler.github.io/Drawflow/>                                                                              |

For R-C3 (automated dialog graph), **Rete.js** wins: the dialog automation needs to actually _execute_, and Rete provides the engine for it.

## 8. WebRTC peer-to-peer sync

Stack options:

- **PeerJS** — wraps WebRTC signaling with a clean API for data channels. <https://peerjs.com/>
- **simple-peer** — lower-level building block. <https://github.com/feross/simple-peer>
- **automerge-repo** — ships a WebRTC network adapter alongside CRDT semantics. Recommended for CRDT sync scenarios. <https://automerge.org/docs/repositories/>
- **RxDB WebRTC plugin** — DB-level replication. <https://rxdb.info/replication-webrtc.html>
- **GunDB** — graph DB with built-in P2P. <https://gun.eco/>

Plan: `automerge-repo` + WebRTC adapter for structured records, `y-webrtc` for collaborative text channels. PeerJS is a fallback if we need a pure data-channel transport.

## 9. Messenger export formats and APIs

Per-network legal export options (December 2025 / January 2026):

| Network                               | Export route                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Telegram                              | Official **Takeout API** — JSON/HTML. <https://core.telegram.org/api/takeout> Telegram Desktop also exports JSON locally.        |
| WhatsApp                              | **Per-chat "Export chat"** (txt + media zip). WhatsApp Business Cloud API for opted-in flows; bulk export is restricted.         |
| Signal                                | Server-side export forbidden by design. **On-device backups** only — Android encrypted backup, Desktop's `signal-backup-decode`. |
| Facebook                              | **Download Your Information** (HTML/JSON archive).                                                                               |
| X                                     | Official **archive download** (JSON + media).                                                                                    |
| LinkedIn                              | Official **Get a copy of your data** (CSV bundle).                                                                               |
| VK                                    | HTML archive (parsed by `konard/vk-export`); native API.                                                                         |
| career.habr.com / hh.ru / superjob.ru | Public APIs and account exports — to be researched per network in follow-up.                                                     |

[**MasterScrat/Chatistics**](https://github.com/MasterScrat/Chatistics) parses Messenger/Hangouts/WhatsApp/Telegram exports into DataFrames — useful import baseline.

## 10. Encrypted-at-rest in Electron / browser

| Tool                   | Where it fits                                                                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLCipher**          | Transparent AES-256-CBC + PBKDF2-HMAC-SHA512 over SQLite. Works with `node-sqlite3` / `better-sqlite3` in Electron. <https://www.zetetic.net/sqlcipher/design/> |
| **libsodium-wrappers** | Symmetric/asymmetric crypto in browser/Node. Small surface. <https://github.com/jedisct1/libsodium.js>                                                          |
| **age**                | File-level export bundles and key wrapping. <https://age-encryption.org/>                                                                                       |

Plan: SQLCipher for the Doublets sidecar SQLite (if used) and any Electron cache; libsodium for envelope encryption of `.lino` exports; age for inter-machine bundle wrapping.

## 11. SQLite / LevelDB in the browser (WASM)

| Option                      | Notes                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Official `sqlite3.wasm`** | Canonical OPFS-backed build. Requires SharedArrayBuffer + COOP/COEP. <https://sqlite.org/wasm>                                        |
| **wa-sqlite**               | Multiple VFS variants (OPFSAdaptive, IDBBatchAtomic). Works without COOP/COEP via Asyncify. <https://github.com/rhashimoto/wa-sqlite> |
| **sql.js**                  | In-memory only — fine for read-only embedded data. <https://sql.js.org/>                                                              |
| **absurd-sql**              | Considered legacy.                                                                                                                    |
| **level-js over IndexedDB** | Standard LevelDB-in-browser route. <https://github.com/Level/level-js>                                                                |

For Meta Sovereign's browser deployment, **sqlite3.wasm + OPFS** is the default; **wa-sqlite** is the fallback when COOP/COEP can't be configured (e.g. GitHub Pages).

The **primary** local-first store is still `doublets-web` (Doublets in WASM). SQLite-in-browser is a _secondary_ option for ancillary search indexes (FTS5) where a relational index is more convenient than a Doublets query.

## 12. Cross-platform shells (Electron + browser + mobile)

| Option        | Notes                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Tauri 2**   | System webview, ~3-10 MB bundles, targets iOS/Android in v2. Strong fit for a Rust-heavy project. <https://v2.tauri.app/>    |
| **Electron**  | Easiest for pure-JS teams; Chromium parity across OSes. <https://www.electronjs.org/>                                        |
| **Capacitor** | Web → mobile + Electron via plugin. Same web build to browser/mobile/desktop with a native shell. <https://capacitorjs.com/> |

The issue prescribes `deep-foundation/sdk` (R-G3). If `deep-foundation/sdk` proves insufficient for iOS/Android, the documented fallback is Tauri 2 (because of the existing Rust investment in `doublets-rs`) or Capacitor (if we want a single web-build everywhere).

---

## Index of cited URLs

- Local-first essay — <https://www.inkandswitch.com/essay/local-first/>
- Local-first talk — <https://martin.kleppmann.com/2019/10/23/local-first-at-onward.html>
- Yjs — <https://yjs.dev/>
- Automerge — <https://automerge.org/>
- Velt CRDT comparison — <https://velt.dev/blog/best-crdt-libraries-real-time-data-sync>
- Monica CRM — <https://www.monicahq.com/>
- Monica docs — <https://docs.monicahq.com/>
- Beeper bridges — <https://developers.beeper.com/bridges>
- Beeper open source — <https://developers.beeper.com/open-source>
- Element — <https://element.io/>
- mautrix bridges — <https://github.com/mautrix>
- REGAE / UIST'20 — <https://glassmanlab.seas.harvard.edu/papers/ips_augex_uist20.pdf>
- Sketch-Driven Regex / TACL — <https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00339/96479/Sketch-Driven-Regular-Expression-Generation-from>
- SplitRegex — <https://arxiv.org/pdf/2205.11258>
- Ohm-JS — <https://ohmjs.org/>
- Fuse.js — <https://www.fusejs.io/>
- MiniSearch — <https://lucaong.github.io/minisearch/>
- React Flow — <https://reactflow.dev/>
- Rete.js — <https://retejs.org/>
- PeerJS — <https://peerjs.com/>
- automerge-repo — <https://automerge.org/docs/repositories/>
- RxDB WebRTC plugin — <https://rxdb.info/replication-webrtc.html>
- GunDB — <https://gun.eco/>
- Telegram Takeout API — <https://core.telegram.org/api/takeout>
- SQLCipher design — <https://www.zetetic.net/sqlcipher/design/>
- libsodium.js — <https://github.com/jedisct1/libsodium.js>
- age — <https://age-encryption.org/>
- SQLite WASM — <https://sqlite.org/wasm>
- wa-sqlite — <https://github.com/rhashimoto/wa-sqlite>
- sql.js — <https://sql.js.org/>
- level-js — <https://github.com/Level/level-js>
- Tauri 2 — <https://v2.tauri.app/>
- Electron — <https://www.electronjs.org/>
- Capacitor — <https://capacitorjs.com/>
