# Roadmap (languages: en • [zh](ROADMAP.zh.md) • [hi](ROADMAP.hi.md) • [ru](ROADMAP.ru.md))

## No Open Tracked Roadmap Items

The issue #1 roadmap is currently empty. Every requirement extracted
from the original issue and the PR #2 maintainer follow-ups is tracked
in [`docs/REQUIREMENTS.md`](./REQUIREMENTS.md), and each row is marked
Done with implementation evidence.

This file stays present as the reviewer-facing roadmap ledger requested
in PR #2. If a new gap is found during review, add it here with the
matching requirement ID before marking the related requirement Done.

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
