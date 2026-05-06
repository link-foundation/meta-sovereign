# Requirements (languages: [en](REQUIREMENTS.md) • [zh](REQUIREMENTS.zh.md) • hi • [ru](REQUIREMENTS.ru.md))

यह `meta-sovereign` का top-level requirements ledger हिंदी में है। Stable
`R-*` IDs, code symbols, routes, commands और file paths original form में
रखे गए हैं ताकि उन्हें अंग्रेजी [`REQUIREMENTS.md`](./REQUIREMENTS.md),
changesets, PRs और code comments से cross-reference किया जा सके।

हर issue की detailed breakdown [`docs/case-studies/`](./case-studies/) में
है। [`docs/ROADMAP.md`](./ROADMAP.md) reviewer-facing roadmap ledger के
रूप में मौजूद रहता है।

## A. Data layer

R-A1..R-A5 unified database import/export, `.lino` files, binary
Doublets + text store sync, automatic encrypted backups और indented Links
Notation preference cover करते हैं। State: done via `DualStore`,
`LinoTextStore`, backup scheduler और secret-link encryption।

## B. Unified communication UI

R-B1..R-B4 unified chat UI, previous outgoing messages से autocomplete,
operator DONE/NEXT workflow और cross-service broadcast UI मांगते हैं।
State: done in SPA views और `/api/*` routes।

## C. Pattern matching और reply automation

R-C1..R-C5 regex/PEG pattern editor, reply variation editor, n8n-style
graph automation, auto/semi-auto modes और multi-message fact extraction
cover करते हैं। State: done in patterns, facts, graph और reply surfaces।

## D. Personal CRM

R-D1..R-D6 contact detail aggregation, audience DSL, mass-personal
outreach, configurable search, profile sync और resume sync cover करते
हैं। State: done।

## E. External-service connectors

R-E1..R-E10 VK, Telegram, X, WhatsApp, Facebook, LinkedIn,
career.habr.com, hh.ru, superjob.ru और email के archive/live support की
मांग करते हैं। State: done; adapters data को unified links में normalize
करते हैं।

## F. Distribution, sync, deployment

R-F1..R-F8 NPM library surface, CLI, Electron, local web server, WebRTC
sync, Docker microservices और server/client Universal Links API cover
करते हैं। State: done।

## G. Stack constraints

R-G1..R-G3 JS server/client + React UI + Rust/WASM heavy workloads,
pure-Rust alternative server और iOS/Android/Electron packaging cover करते
हैं। State: done।

## H. Quality, design, process

R-H1..R-H6 Apple/Material/Fluent UI guidance, simple code, automated API
docs, unit/integration/e2e coverage, CI/CD parity और Unlicense cover करते
हैं। State: done।

## I. Documentation deliverable (issue #1)

R-I1..R-I5 issue #1 case study, online research, requirements, solution
plan और components survey मांगते हैं। State: done।

## J. Maintainer directives from PR #2

R-J1..R-J11 offline browser storage, server autodiscovery,
WebRTC/WebSocket, handler-driven store API, handled stamps,
decentralized GitHub Pages deployment, browser-commander e2e, pure-Rust
server, requirements/roadmap ledger, single-PR completion और CI timeout
policy cover करते हैं। State: done।

## K. Hardening (issue #6)

R-K1..R-K20 soft delete, recoverable tombstones, explicit purge, sync
semantics, provider delete behavior, vault master key, multiple unlock
methods, encrypted exports, HTTP/CLI purge/export और issue #6 case study
cover करते हैं। State: done।

## L. Browser-first publishing (issue #8)

R-L1..R-L15 GitHub Pages SPA publishing, browser-first docs, Pages
workflow, server discovery, Rust/JS backend guidance, case study और CI/CD
alignment cover करते हैं। State: done।

## M. Newbie-friendly UI (issue #10)

R-M1..R-M18 connection guides, CORS-aware probes, theme toggle, tutorial
overlay, settings guidance, e2e coverage और issue #10 case study cover
करते हैं। State: done।

## N. Tutorial progress persistence (issue #13)

R-N1..R-N9 tutorial refresh persistence, Next/Skip/Complete persistence,
reopen reset, case study, external research और root-cause note cover करते
हैं। State: done।

## O. Email support (issue #3)

R-N1..R-N10 (historical numbering retained) email research, archive
import, Gmail/Microsoft Graph/JMAP live receive/send, IMAP/POP3/SMTP
local-server fallback, HTTP routes, CLI/API surface और reproducing tests
cover करते हैं। State: done।

## P. Provider connections (issue #16)

R-O1..R-O19 provider credential forms, archive upload/paste import,
settings surface, Connect first CTA, secret storage, probe
classification, CORS help, tests और issue #16 case study cover करते हैं।
State: PR #17 still in progress।

## Q. UI और documentation internationalisation (issue #18)

R-Q1..R-Q10 SPA language switcher, browser language detection, local
override persistence, `<html lang>`/`dir`, authored UI strings के
translation keys, dictionary parity tests, Markdown language switchers,
translated docs siblings, docs-language automation, issue #18 case study
और PR #19 single-PR delivery cover करते हैं। State: PR #19 in progress।

## U. Mobile-first UI overhaul (issue #25)

R-N1..R-N12 mobile-first AppShell (bottom-nav / side-rail / permanent
drawer), Apple Liquid Glass tokens जिनके साथ
`prefers-reduced-transparency` fallback है, पूरा translation coverage
(non-EN build में कोई English literal नहीं), अलग Connections page
(हर provider के लिए एक card और
`connected/not-connected/action-required` state badge), dedicated setup
detail screen, per-provider `setupSteps[]`, element-anchored tutorial
spotlight, और "Connect a service" से शुरू होने वाला default tutorial
sequence cover करते हैं। State: PR #26 branch `issue-25-dac43a780b5c`
पर in progress। विस्तृत table के लिए
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section U देखें।

## Traceability

Future PR या commit feature land करे तो changeset और PR description में
matching `R-*` ID reference करें, ताकि यह list live spec बनी रहे।
