# Requirements (languages: [en](REQUIREMENTS.md) • [zh](REQUIREMENTS.zh.md) • [hi](REQUIREMENTS.hi.md) • ru)

Это русская версия top-level requirements ledger для `meta-sovereign`.
Stable `R-*` IDs, code symbols, routes, commands и file paths оставлены
в исходном виде, чтобы их можно было сверять с английским
[`REQUIREMENTS.md`](./REQUIREMENTS.md), changesets, PRs и code comments.

Detailed breakdown по каждому issue находится в
[`docs/case-studies/`](./case-studies/). [`docs/ROADMAP.md`](./ROADMAP.md)
остается reviewer-facing roadmap ledger.

## A. Data layer

R-A1..R-A5 покрывают unified database import/export, `.lino` files,
binary Doublets + text store sync, automatic encrypted backups и
indented Links Notation. State: done через `DualStore`, `LinoTextStore`,
backup scheduler и secret-link encryption.

## B. Unified communication UI

R-B1..R-B4 требуют unified chat UI, autocomplete на основе previous
outgoing messages, operator DONE/NEXT workflow и cross-service broadcast
UI. State: done in SPA views and `/api/*` routes.

## C. Pattern matching and reply automation

R-C1..R-C5 покрывают regex/PEG pattern editor, reply variation editor,
n8n-style graph automation, auto/semi-auto modes и multi-message fact
extraction. State: done in patterns, facts, graph and reply surfaces.

## D. Personal CRM

R-D1..R-D6 покрывают contact detail aggregation, audience DSL,
mass-personal outreach, configurable search, profile sync и resume sync.
State: done.

## E. External-service connectors

R-E1..R-E10 требуют archive/live support для VK, Telegram, X, WhatsApp,
Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru и email. State:
done; adapters normalize data into unified links.

## F. Distribution, sync, deployment

R-F1..R-F8 покрывают NPM library surface, CLI, Electron, local web
server, WebRTC sync, Docker microservices и server/client Universal
Links API. State: done.

## G. Stack constraints

R-G1..R-G3 покрывают JS server/client + React UI + Rust/WASM heavy
workloads, pure-Rust alternative server и iOS/Android/Electron packaging.
State: done.

## H. Quality, design, process

R-H1..R-H6 покрывают Apple/Material/Fluent UI guidance, simple code,
automated API docs, unit/integration/e2e coverage, CI/CD parity и
Unlicense. State: done.

## I. Documentation deliverable (issue #1)

R-I1..R-I5 требуют case study, online research, requirements, solution
plan и components survey для issue #1. State: done.

## J. Maintainer directives from PR #2

R-J1..R-J11 покрывают offline browser storage, server autodiscovery,
WebRTC/WebSocket, handler-driven store API, handled stamps,
decentralized GitHub Pages deployment, browser-commander e2e, pure-Rust
server, requirements/roadmap ledger, single-PR completion и CI timeout
policy. State: done.

## K. Hardening (issue #6)

R-K1..R-K20 покрывают soft delete, recoverable tombstones, explicit
purge, sync semantics, provider delete behavior, vault master key,
multiple unlock methods, encrypted exports, HTTP/CLI purge/export и
case study для issue #6. State: done.

## L. Browser-first publishing (issue #8)

R-L1..R-L15 покрывают GitHub Pages SPA publishing, browser-first docs,
Pages workflow, server discovery, Rust/JS backend guidance, case study и
CI/CD alignment. State: done.

## M. Newbie-friendly UI (issue #10)

R-M1..R-M18 покрывают connection guides, CORS-aware probes, theme toggle,
tutorial overlay, settings guidance, e2e coverage и case study для issue
#10. State: done.

## N. Tutorial progress persistence (issue #13)

R-N1..R-N9 покрывают tutorial refresh persistence, Next/Skip/Complete
persistence, reopen reset, case study, external research и root-cause
note. State: done.

## O. Email support (issue #3)

R-N1..R-N10 (historical numbering retained) покрывают email research,
archive import, Gmail/Microsoft Graph/JMAP live receive/send,
IMAP/POP3/SMTP local-server fallback, HTTP routes, CLI/API surface и
reproducing tests. State: done.

## P. Provider connections (issue #16)

R-O1..R-O19 покрывают provider credential forms, archive upload/paste
import, settings surface, Connect first CTA, secret storage, probe
classification, CORS help, tests и issue #16 case study. State: PR #17
still in progress.

## Q. UI and documentation internationalisation (issue #18)

R-Q1..R-Q10 покрывают SPA language switcher, browser language detection,
local override persistence, `<html lang>`/`dir`, translation keys для
authored UI strings, dictionary parity tests, Markdown language
switchers, translated docs siblings, docs-language automation, issue #18
case study и single-PR delivery in PR #19. State: PR #19 in progress.

## U. Mobile-first UI overhaul (issue #25)

R-N1..R-N12 покрывают mobile-first AppShell (bottom-nav / side-rail /
permanent drawer), Apple-glass tokens с `prefers-reduced-transparency`
fallback, full translation coverage (no English literal в non-EN
builds), separate Connections page с одним card per provider и
`connected/not-connected/action-required` state badge, dedicated detail
screen и `setupSteps[]` per provider, element-anchored tutorial
spotlight и "Connect a service" opening step. State: PR #26 in progress
on branch `issue-25-dac43a780b5c`. Detailed table:
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section U.

## Traceability

Когда future PR или commit добавляет feature, reference matching `R-*` ID
в changeset и PR description, чтобы этот список оставался live spec.
