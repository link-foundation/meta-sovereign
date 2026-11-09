---
'meta-sovereign': minor
---

Start shared browser sessions, CV reads/syncs and browser-based messaging with visible windows by default (R-AA2). Keep explicit `--headless` and API/library headless overrides for unattended operation.

Add persistent visible/headless browser preferences per workflow and provider slot, with CLI, API and Settings controls. Isolate named profiles and apply the shared policy to CV, browser messaging, marketplace and import sessions; migrate existing stores to schema 7 (R-Z17).

Refresh direct dependencies, the resolved dependency graph, CI tools and the pinned Node container. Share the current Links Notation parser and object codec across dependencies and prepare the Lino REST transport integration (R-AA8–R-AA11).

Retain lazy Telegram session loading with the updated generated namespace, keep pre-tombstone backup fixtures pinned to schema 5, and remove redundant contact-slug regex quantifiers flagged by CodeQL.

Use Lino REST for structured JavaScript HTTP requests and replies, negotiate readable or binary Links Notation, and require explicit opt-in for legacy JSON. Migrate browser fetch, upload progress, recovery and browser fixtures together; preserve provider protocols and raw file transfers (R-AA16).

Keep electron-builder 27's update feeds compatible with stable electron-updater 6 and existing installations, with a regression using the builder's actual metadata validation (R-AA14, R-AA19).

Send live chat and multi-account notification events as single-line Lino records, require explicit JSON event compatibility, and keep reconnect, origin, filtering and backpressure behavior (R-AA16).

Use negotiated text/binary Links Notation for JavaScript WebSocket sync, WebRTC signaling and data channels. Require explicit JSON compatibility, reject mismatched frames, and bound frames and pending queues (R-AA16).

Wait for rolling workers and their stdio to close before releasing shutdown ownership, including failed warm readers, so store cleanup cannot race worker disposal.

Keep Chat and Operator readers in place when a viewport resize and an upward scroll precede composer expansion; retain geometry diagnostics behind the existing browser debug opt-in.

Preserve the Chat/Operator live tail across coalesced WebKit layout and caret scrolls, while explicit reader gestures cancel pending composer corrections.

Use versioned, bounded text/binary Lino records for TCP sync with explicit legacy JSON mode. Keep sync CLI commands alive for replication and close connections and stores on shutdown (R-AA16).

Release owned stores and await service cleanup after listener failure and shutdown. Close snapshot SQLite handles before reporting completion, preserving caller ownership of injected stores.

Preserve existing large Number values across readable Lino HTTP/sync, text stores and recovery archives, while retaining numeric-looking string keys and values. Report the upstream object-codec defect with a finite reproduction.

Negotiate readable/binary Links Notation on existing native Rust HTTP, WebSocket sync and signaling endpoints, with explicit legacy JSON opt-in, bounded typed codecs/queues, strict fragmented frames and per-recipient reencoding. Verify real production JavaScript/native interoperability in CI (R-AA16).

Add independent streamed text and binary Lino recovery dump primitives with checked-before-write restore, secret exclusion, private durable writes, bounded packets and verified retention (R-AA17).

Create both recovery dumps on the default server schedule, persist interval/retention/format choices across CLI, Lino API and Backup UI, and confirm restore results. Preserve stored nonfinite/undefined values independently of network normalization and release CLI restore writers before returning.
