# Architecture — Meta Sovereign 0.0.1

This document sketches the high-level architecture of the prototype. It satisfies R-A3 (dual binary+text store), R-F8 (universal Links access in client and server), R-G1 (JS + Rust/WASM stack) and R-G2 (pure-Rust stack option). It is intentionally lightweight — the aim is to lock in interfaces, not pre-design every module.

## 1. Layered overview

```
              +------------------------------------------------+
              |                  UI layer                       |
              |  Operator UI  |  Unified Chat UI  |  CRM UI    |
              |  Pattern Editor | Reply Editor | Dialog Graph   |
              +------------------------------------------------+
                                   |
              +------------------------------------------------+
              |          Universal Links Access API            |
              |    read/write to Doublets (binary) AND Lino    |
              |          (text), client-side and server-side   |
              +------------------------------------------------+
                                   |
   +-------------------+   +---------------------+   +---------------+
   |    Importers      |   |   CRDT Sync layer   |   |  Automation   |
   |  (per network)    |   |  Automerge / Yjs    |   |  Engine       |
   |  VK / TG / WA /   |   |  WebRTC adapter     |   |  Rete.js v2   |
   |  FB / X / LI /    |   +---------------------+   |  patterns/    |
   |  hh.ru / habr /   |                              |  replies      |
   |  superjob.ru      |                              +---------------+
   +-------------------+
                                   |
              +------------------------------------------------+
              |               Storage layer                     |
              |  Doublets (doublets-rs / doublets-web WASM)    |
              |  Links Notation (links-notation, lino-codec)   |
              |  Optional FTS index (sqlite-wasm + OPFS)        |
              |  Encrypted-at-rest envelope (libsodium / age)  |
              +------------------------------------------------+
                                   |
              +------------------------------------------------+
              |               Runtime shell                     |
              |  CLI (lino-arguments)                          |
              |  Local web server (Node/Bun)                   |
              |  Electron app (deep-foundation/sdk)            |
              |  Browser PWA  (sqlite-wasm + doublets-web)     |
              |  Optional Docker microservices: web + WebRTC   |
              +------------------------------------------------+
```

## 2. Universal Links Access API

A single TypeScript interface (also exposed in Rust) with the **same signature** on client and server:

```ts
interface UniversalLinksAccess {
  // Reads (binary store first, falls back to text store)
  query(pattern: LinkPattern): AsyncIterable<Link>;
  get(id: LinkId): Promise<Link | null>;

  // Writes (write-through to both stores)
  put(link: Link): Promise<LinkId>;
  delete(id: LinkId): Promise<void>;

  // Sync hooks (used by the CRDT sync layer)
  subscribe(filter: LinkPattern, cb: (event: LinkEvent) => void): Unsubscribe;
}
```

- On the **server**, both stores are local files; the implementation writes to Doublets (binary) and to `.lino` text files at the same time. Backups (R-A4) are atomic snapshots of both.
- On the **browser/Electron client**, the implementation backs onto `doublets-web` (WASM) for the binary store and onto an in-memory Lino representation that is periodically flushed to OPFS / the user's filesystem.
- The CRDT sync layer never talks to the disk directly — it always goes through this API.

## 3. Storage layer

| Concern              | Choice                                                                      | Rationale                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary binary store | `doublets-rs` (server) / `doublets-web` (client)                            | Issue-prescribed; fast, mmap, language-neutral.                                                                                            |
| Primary text store   | `links-notation` + `lino-objects-codec`                                     | Issue-prescribed; portable, diffable, human-readable.                                                                                      |
| Search index         | `sqlite-wasm` + FTS5 (browser, OPFS) / SQLCipher (Electron)                 | Optional — kept as a sidecar derived from the primary stores; can be regenerated.                                                          |
| Encryption           | `libsodium` (envelope on `.lino` exports) and `age` (cross-machine bundles) | The primary stores are unencrypted on disk; users opt into encryption per export. SQLCipher protects the search index at rest in Electron. |
| Backup format        | `.tar.zst` containing `data.lino`, `doublets.bin`, `meta.json`              | Self-describing, restorable on any platform.                                                                                               |

## 4. Importer adapters

Every network gets the same shape:

```ts
interface MessageSource<Cursor = unknown> {
  readonly id:
    | 'vk'
    | 'telegram'
    | 'x'
    | 'whatsapp'
    | 'facebook'
    | 'linkedin'
    | 'habr'
    | 'hh'
    | 'superjob';
  init(opts: AdapterOpts): Promise<void>;
  pull(since?: Cursor): AsyncIterable<RawMessage>;
  importArchive(path: string): AsyncIterable<RawMessage>;
}
```

Each adapter is a separate NPM package (R-F1) and depends on the existing konard tools (`vk-export`, `telegram-bot`, `broadcast`, etc.) for the heavy lifting. The adapters convert their network-specific payloads into a uniform `Message` link shape that the storage layer ingests.

## 5. CRDT sync layer

- `automerge-repo` for structured records (contacts, groups, facts, dialog graph).
- `Yjs` (with `y-webrtc`) for collaborative free-text fields (reply variations, draft messages).
- Each user-owned device participates as a peer; one device may optionally act as the user's personal cloud relay (R-F5, R-F6).
- The sync layer subscribes to `UniversalLinksAccess.subscribe` to translate local writes into CRDT operations.

## 6. Automation engine

- **Rete.js v2** owns the runtime graph: nodes are patterns, branches, reply-variation pickers, and side-effect actions (send to network).
- Nodes are persisted as Doublets links (R-A3), so the dialog graph itself is part of the unified database — backed up, exported, synced like everything else.
- Two execution modes (R-C4):
  - _Auto:_ the engine fires on every match and picks a reply variation.
  - _Semi-auto:_ the engine surfaces a candidate reply in the Operator UI; user confirms, edits, or rejects.

## 7. UI surfaces

| Surface                    | Purpose                                                               | Stack                                                            |
| -------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Unified Chat UI**        | One inbox spanning all networks.                                      | React + Tauri/Electron + WebRTC live updates.                    |
| **Operator UI**            | Card-stream interface (DONE/NEXT) over unread items.                  | React; mirrors `link-assistant/operator`.                        |
| **CRM UI**                 | Contact/group/community pages, intersections, mass-personal outreach. | React + table virtualisation + saved-query model.                |
| **Pattern Editor**         | Build regex/PEG patterns from example messages.                       | React + Ohm-JS playground; hot-loads candidates from MiniSearch. |
| **Reply-Variation Editor** | Manage groups of variant replies.                                     | React; Fuse.js for fuzzy lookup against history.                 |
| **Dialog Graph**           | n8n-like canvas of patterns + replies.                                | React + Rete.js v2.                                              |
| **Backup/Settings**        | Profile sync, resume sync, encryption keys, backup target folder.     | React.                                                           |

## 8. Runtime shells (R-F2 / R-F3 / R-F4)

| Shell                    | Description                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta-sovereign` CLI     | Subcommands for import, export, backup, key management, sync; built on `lino-arguments`.                                                       |
| `meta-sovereign-web`     | Local web server (Node or Bun) that exposes the Universal Links API over HTTP/WebSocket. Used by the browser PWA when run on the same machine. |
| `meta-sovereign-desktop` | Electron app (Tauri optional) wrapping the same React bundle.                                                                                  |
| Docker images            | `meta-sovereign-web` and `meta-sovereign-rtc` (WebRTC signalling + relay) for personal-cloud deployment.                                       |

## 9. Pure-Rust parity track (R-G2)

A second runtime is planned in pure Rust:

- `meta-sovereign-rs/server` — equivalent of `meta-sovereign-web`, using `axum` + `doublets-rs` + a Rust port of `lino-objects-codec`.
- `meta-sovereign-rs/cli` — equivalent of the CLI; uses `clap` + `lino-arguments` Rust bindings.
- The on-disk format (Doublets + `.lino`) is shared; users can switch stacks without re-importing.

## 10. Cross-cutting concerns

- **Backups (R-A4)**: a daemon job (cron in CLI / Electron timer / Docker sidecar) snapshots the primary stores to `${backup_dir}/YYYY/MM/DD/HH-MM-SS.tar.zst`. Retention rules are configured in `lino-arguments`.
- **Logging**: structured logs to local file; never network-ingressed by default.
- **Telemetry**: opt-in only; off by default. The whole architecture stays usable with telemetry permanently disabled.
- **Testing (R-H4)**: unit tests per package, integration tests per adapter (against fixture archives), e2e tests through `browser-commander` against the Electron app.
- **Docs (R-H3)**: TypeDoc for JS/TS packages, rustdoc for Rust crates; aggregated to a top-level `docs/api/` site.
- **CI parity (R-H5)**: every package inherits the JS pipeline template; every Rust crate inherits the Rust pipeline template. Discrepancies discovered during integration are filed as issues against the templates.

## 11. Out of scope for v0.0.1

- No federated identity / no multi-user accounts. The whole system assumes a single user.
- No automated content moderation / NSFW filtering. The user owns the policy.
- No on-device LLM. Out of scope, can be added later as an automation node type.
- No paid API integrations. All connectors must work with free-tier APIs or local exports.
