# Roadmap (languages: en • [zh](ROADMAP.zh.md) • [hi](ROADMAP.hi.md) • [ru](ROADMAP.ru.md))

## No Open Tracked Roadmap Items

The issue #1 roadmap is currently empty. Every requirement extracted
from the original issue and the PR #2 maintainer follow-ups is tracked
in [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md), and each row is marked
Done with implementation evidence.

This file stays present as the reviewer-facing roadmap ledger requested
in PR #2. If a new gap is found during review, add it here with the
matching requirement ID before marking the related requirement Done.

What Telegram client features are supported, partial, parked or not
supported is tracked in [`docs/FEATURES.md`](./FEATURES.md).

## Audit follow-ups (R-Z)

An audit of the finished work found gaps. They are grouped in two waves. Wave 1 is **in progress**, not done. Wave 2 is **planned, not started**. Nothing here is a promise or a date.

### Wave 1 — in progress

- R-Z1: harden the local server.
- R-Z2 (done): make the store, backups, saved secrets and logs safer.
- R-Z3 (done): make automated sending safer (at most once, paced, quiet hours, opt-out list).
- R-Z4 (done): make send and sync results truthful (no public LinkedIn post by mistake, no false CV-sync success, X direct messages, clear fallbacks).
- R-Z5 (done): fix email (safe sending, correct parsing and threading, verified TLS, incremental pulls, a fetch button).
- R-Z6: get CI green (Deno, Bun, Windows, `cargo test`, browser e2e in CI).

### Wave 2 — planned, not now

- R-Z7: wire up code that exists but never runs: the automatic backup schedule, deleted-message tombstones (view, recover, purge), audience membership sync, the 24-hour Upwork and PeoplePerHour cache purge, the tutorial Skip button, and refresh tokens that are stored but unused.
- R-Z8: pull inbox messages for GitHub, Upwork and PeoplePerHour (email is in R-Z5), and bring VK live updates, history paging, media and reactions up to par.
- R-Z9: WhatsApp personal: a visible sign-in window (QR) for WhatsApp Web, stable chat ids, a better archive parser, a terms-of-service notice.
- R-Z10: archive imports for Facebook, Instagram, X and LinkedIn: fix colliding ids, garbled text, missing attachments, reactions and participants.
- R-Z11: GitHub: edit, delete and react to messages, review comments, notifications, incremental pull, discussions, listing repositories.
- R-Z12: page consistency: Escape and focus handling in 16 dialogs, show errors that are swallowed today, fix the credentials browser test.
- R-Z13 (done): docs: per-system feature matrices in four languages, the missing R, S and T sections in the ru, hi and zh requirements, duplicate R-N ids, the README npm claim, this roadmap, `MS_SECRET_PASSPHRASE`, and honest Rust server limits.

### Not doing now

- Publishing the package to npm (needs the owner).
- Checking the web selectors against real accounts (needs real accounts).
- WebAuthn and TOTP unlock.
- Rust server parity with the JS server: only documented, see [`docs/SERVER-PARITY.md`](./SERVER-PARITY.md).

## Closed Scope

The closed implementation history is preserved in
[`docs/case-studies/issue-1/solution-plan.md`](./case-studies/issue-1/solution-plan.md).
The final PR #2 state covers:

- Local-first dual storage, `.lino` import/export, encrypted backups,
  and secret-link encryption.
- Archive and live connectors for VK, Telegram, X, WhatsApp, Facebook,
  LinkedIn, career.habr.com, hh.ru, and superjob.ru.
- React SPA surfaces for chat, operator workflow, automation graphs,
  patterns, replies, facts, CRM, audience, outreach, broadcast,
  profile/resume sync, backup/restore, status, and sync.
- Browser storage, server autodiscovery, WebSocket sync, WebRTC sync,
  Electron, mobile packaging, Docker deployment, and pure-Rust server
  parity.
- Unit, integration, Rust, and browser-commander e2e coverage,
  including accessibility and two-browser WebRTC convergence.
