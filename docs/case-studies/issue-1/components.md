# Components & Libraries — Issue #1

This catalogue covers every repository explicitly linked from the issue. For each, we record what it does, primary language, and how it would be used in the Meta Sovereign prototype. Sources: `gh repo view OWNER/REPO` and the project READMEs.

External (non-issue) references are in `external-research.md`.

---

## A. Data formats and storage

### `link-foundation/links-notation`

- **Language:** Rust (with bindings: JS, C#, Python, Go, Java).
- **What it does:** Parses a custom _Links Notation_ — e.g. `papa (lovesMama: loves mama)` — into lists of references and links and back. Acts as a JSON/XML alternative for describing data via references.
- **Use in Meta Sovereign:** Canonical text format for the unified database (R-A3, R-A5). All `.lino` import/export goes through this parser.

### `link-foundation/lino-objects-codec`

- **Language:** JavaScript (with feature parity in Python, Rust, C#).
- **What it does:** Universal serialization library encoding objects to/from Links Notation. Handles circular references, object identity, UTF-8 (base64), primitives.
- **Use in Meta Sovereign:** Serialise the cyclic, multi-typed personal data graph (contacts ↔ messages ↔ groups ↔ facts) to `.lino` (R-A2) and back, without reference loss.

### `link-foundation/link-cli`

- **Language:** C#.
- **What it does:** CLI tool (`clink`) that performs CRUD on links via a single Markov-style substitution operation. Turing-complete; built on the C# Doublets library.
- **Use in Meta Sovereign:** Command-line manipulation/migration of the local data store from shell scripts during one-off imports/exports (R-A1, R-F2). The Rust port (`link-cli` Rust variant or direct `doublets-rs`) would be the runtime equivalent.

### `linksplatform/doublets-rs`

- **Language:** Rust.
- **What it does:** Rust implementation of _Doublets_ — file-mapped associative storage where each link has Index, Source, Target. Supports memory-mapped persistence, generic integer types, thread-safe access, query patterns, and FFI bindings.
- **Use in Meta Sovereign:** **Primary binary store** of the unified database (R-A3). High performance, no server needed.

### `linksplatform/doublets-web`

- **Language:** Rust → WebAssembly + JS.
- **What it does:** WebAssembly bindings for `doublets-rs`, published to npm as `doublets-web`. Lets browsers/Node use the same Doublets store.
- **Use in Meta Sovereign:** Powers the same store **in the browser** (R-F4) and inside Electron's renderer when needed (R-F3). Enables a fully client-side personal data store.

### `link-foundation/lino-arguments`

- **Language:** JavaScript + Rust.
- **What it does:** Unified config library that merges CLI args + env vars + config file (case-insensitive) using `yargs` (JS) / `clap` (Rust).
- **Use in Meta Sovereign:** Standardises CLI configuration across every importer / CLI subcommand (R-F2).

---

## B. Cross-platform SDK

### `deep-foundation/sdk`

- **Language:** JavaScript (Next.js).
- **What it does:** A Next.js boilerplate / template for "deep" applications, mergeable into existing repos via a special "ours" git strategy; supports web, Electron and SSR builds.
- **Use in Meta Sovereign:** Starting template for the Next.js + Electron app shell (R-G3, R-F3, R-F4). If iOS/Android needs grow heavier than what this SDK covers, Capacitor (web→mobile) or Tauri 2 (Rust-native) are documented alternatives in `external-research.md`.

---

## C. Existing tools to reuse

### `konard/broadcast`

- **Language:** JavaScript (Bun).
- **What it does:** Multi-platform message broadcasting CLI for Telegram channels, VK walls, X.com. Modular per-platform broadcasters and dual Telegram (Bot + User) auth.
- **Use in Meta Sovereign:** Outbound (export/post) side of the unified broadcasting UI (R-B4).

### `konard/vk-bot`

- **Language:** JavaScript.
- **What it does:** Small VK bot using the Kate Mobile token auth flow.
- **Use in Meta Sovereign:** Reference implementation for VK token bootstrap and message handling loops (R-E1).

### `konard/vk`

- **Language:** Shell.
- **What it does:** "VK automation for personal auditory growth" — shell scripts plus Selenium-based automatic VK token refresh.
- **Use in Meta Sovereign:** Headless token-refresh automation that can keep long-running personal VK importers authenticated (R-E1).

### `konard/vk-export`

- **Language:** Rust (with JS counterpart).
- **What it does:** Parses exported VK private message HTML archives into JSON.
- **Use in Meta Sovereign:** Direct importer for migrating archived VK conversations into the personal CRM (R-A1, R-E1). Already Rust — fits the "pure Rust stack" goal.

### `konard/vk-browser`

- **Language:** HTML/JS.
- **What it does:** Pure-browser React.js VK bot doing OAuth (Kate Mobile) + long polling, no backend; deployable on GitHub Pages.
- **Use in Meta Sovereign:** Demonstrates a fully client-side, server-less VK message ingestion path (R-E1, R-F4). Privacy-friendly because nothing leaves the browser.

### `konard/telegram-bot`

- **Language:** TypeScript.
- **What it does:** Exports Telegram chat history (using a user account, not a bot) to Markdown + JSON + media files; partitions large exports; uses `lino-arguments`.
- **Use in Meta Sovereign:** Primary Telegram importer (R-E2, R-A1).

### `konard/follow`

- **Language:** JavaScript (Bun).
- **What it does:** CLI tools to list/manage VK group chats and join Telegram groups/channels.
- **Use in Meta Sovereign:** Discovery side — enumerating user's group chats so they can be ingested (R-D1, R-E1, R-E2).

### `konard/github-pages-telegram-mini-app`

- **Language:** JavaScript (React + Vite).
- **What it does:** Telegram Mini App template hosted on GitHub Pages, with Telegram SDK theme/user integration and Actions deployment.
- **Use in Meta Sovereign:** Optional starter for a Telegram Mini App front-end of the meta profile (auth, theming, mobile UI). Supplementary to R-G3.

### `konard/telegramify-markdown`

- **Language:** Python (originally TypeScript port available).
- **What it does:** Converts standard Markdown to Telegram MarkdownV2, handling escaping, headings, lists, tables, code, spoilers.
- **Use in Meta Sovereign:** Render personal notes/exports back into Telegram cleanly when broadcasting/replying (R-B4, R-E2).

---

## D. UI quality references

### `drklo/telegram` and `telegramdesktop/tdesktop`

- The issue cites these two clients as the **quality bar** for the chat UI (R-B1). They are not dependencies — they're benchmarks. The interaction model (channel list, message-grouping, reactions, search, pinned messages, threaded replies) is what we replicate.

### `n8n.io`

- Cited as the **quality bar** for the automation node graph (R-C3). We do not depend on n8n; we build a similar canvas using Rete.js or React Flow (see `external-research.md`).

---

## E. Reference projects (UX inspiration)

### `link-assistant/operator`

- **Language:** JavaScript.
- **What it does:** React UI concept for an "infinite queue" of cards/chats (humans + AIs from Telegram/VK/X) with two actions: DONE / NEXT, optimised for focus and decision-making.
- **Use in Meta Sovereign:** Direct UX inspiration for the operator/inbox view (R-B3).

---

## F. Testing

### `link-foundation/browser-commander`

- **Language:** JavaScript (also Rust, Python).
- **What it does:** Universal browser-automation library with a unified API across engines focused on "stoppable page triggers" via a page state machine (LOADING / WORKING).
- **Use in Meta Sovereign:** Drives e2e tests (R-H4) and headless scraping for sites without official APIs (R-E5, R-E6).

---

## G. CI/CD baselines

### `link-foundation/js-ai-driven-development-pipeline-template`

- This repository was bootstrapped from this template (see `package.json` description and existing CHANGELOG).
- **Use in Meta Sovereign:** Source of all current CI/CD jobs (R-H5).

### `link-foundation/rust-ai-driven-development-pipeline-template`

- The Rust counterpart with rustfmt, Clippy, llvm-cov, fragment-based changelog, crates.io OIDC publishing.
- **Use in Meta Sovereign:** Will be applied to the pure-Rust stack (R-G2) and to the Rust+WASM heavy-workload crate (R-G1).

---

## H. Summary table

| Concern                      | Library / Project                                                     | Status                                     |
| ---------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Text data format             | `links-notation`, `lino-objects-codec`                                | Linked from issue                          |
| Binary data store            | `doublets-rs`, `doublets-web`, `link-cli`                             | Linked from issue                          |
| CLI args                     | `lino-arguments`                                                      | Linked from issue                          |
| Cross-platform shell         | `deep-foundation/sdk`                                                 | Linked from issue                          |
| VK ingestion                 | `konard/vk*`, `konard/follow`                                         | Linked from issue                          |
| Telegram ingestion           | `konard/telegram-bot`, `konard/follow`, `konard/telegramify-markdown` | Linked from issue                          |
| Outbound broadcast           | `konard/broadcast`                                                    | Linked from issue                          |
| Operator UX inspiration      | `link-assistant/operator`                                             | Linked from issue                          |
| Chat UI quality bar          | `drklo/telegram`, `telegramdesktop/tdesktop`                          | Linked from issue                          |
| Automation graph quality bar | `n8n.io`                                                              | Linked from issue                          |
| E2e tests                    | `browser-commander`                                                   | Linked from issue                          |
| CI/CD baselines              | JS + Rust ai-pipeline templates                                       | Linked from issue                          |
| Local-first sync (CRDT)      | Yjs / Automerge                                                       | External research — `external-research.md` |
| Unified messaging legality   | Beeper / Matrix / mautrix                                             | External research                          |
| Encrypted-at-rest            | SQLCipher, libsodium, age                                             | External research                          |
| Browser SQLite               | sqlite3.wasm + OPFS, wa-sqlite                                        | External research                          |
| Node editor                  | Rete.js v2 (preferred), React Flow                                    | External research                          |
| Fuzzy search                 | Fuse.js + MiniSearch                                                  | External research                          |
| Pattern synthesis research   | REGAE, SplitRegex, Ohm-JS                                             | External research                          |
| Mobile / desktop             | Tauri 2 (alt), Capacitor (alt)                                        | External research                          |
