# 需求 (languages: [en](REQUIREMENTS.md) • zh • [hi](REQUIREMENTS.hi.md) • [ru](REQUIREMENTS.ru.md))

本文件是 `meta-sovereign` 的顶层需求账本的中文版本。稳定的 `R-*` ID、代码
符号、route、命令和文件路径保持原文，便于和英文
[`REQUIREMENTS.md`](./REQUIREMENTS.md)、changeset、PR 和代码注释互相引用。

每个 issue 的完整拆解保存在 [`docs/case-studies/`](./case-studies/)。
[`docs/ROADMAP.md`](./ROADMAP.md) 仍然是 reviewer-facing roadmap ledger。

## A. 数据层

R-A1..R-A5 覆盖统一数据库的外部服务导入/导出、`.lino` 文件、binary
Doublets + text store 同步、自动加密备份，以及偏好 indented Links Notation。
状态：已完成，核心实现为 `DualStore`、`LinoTextStore`、backup scheduler 和
secret-link encryption。

## B. 统一通信 UI

R-B1..R-B4 要求一个统一 chat UI、基于历史 outgoing messages 的自动补全、
operator DONE/NEXT 工作流，以及跨服务 broadcast UI。状态：已完成，SPA view
和 `/api/*` routes 覆盖这些路径。

## C. Pattern matching 与回复自动化

R-C1..R-C5 覆盖 regex/PEG pattern editor、reply variation editor、
n8n-style graph automation、auto/semi-auto modes，以及跨多条消息的个人事实抽
取。状态：已完成，实现在 `src/patterns`、`src/facts`、graph 和 reply
surfaces。

## D. Personal CRM

R-D1..R-D6 覆盖联系人详情聚合、audience DSL、mass-personal outreach、可配置
搜索、profile sync 和 resume sync。状态：已完成。

## E. 外部服务连接器

R-E1..R-E10 要求 VK、Telegram、X、WhatsApp、Facebook、LinkedIn、
career.habr.com、hh.ru、superjob.ru 和 email 的 archive/live support。状态：
已完成；各 adapter 将数据规范化为 unified links。

## F. 分发、同步和部署

R-F1..R-F8 覆盖 NPM library surface、CLI、Electron、local web server、
WebRTC sync、Docker microservices 以及 server/client 的 Universal Links API。
状态：已完成。

## G. Stack constraints

R-G1..R-G3 要求 JS server/client + React UI + Rust/WASM heavy workloads、纯
Rust alternative server，以及通过 `deep-foundation/sdk` 风格的 iOS/Android/
Electron packaging。状态：已完成。

## H. 质量、设计和流程

R-H1..R-H6 覆盖 Apple/Material/Fluent UI guidance、简单代码、自动 API docs、
unit/integration/e2e coverage、CI/CD parity 和 Unlicense。状态：已完成。

## I. issue #1 文档交付

R-I1..R-I5 要求 issue #1 的 case study、online research、requirements、
solution plan 和 components survey。状态：已完成。

## J. PR #2 maintainer directives

R-J1..R-J11 覆盖 offline browser storage、server autodiscovery、WebRTC/
WebSocket、handler-driven store API、handled stamps、decentralized GitHub
Pages deployment、browser-commander e2e、pure-Rust server、requirements/
roadmap ledger、single-PR completion 和 CI timeout policy。状态：已完成。

## K. Hardening (issue #6)

R-K1..R-K20 覆盖 soft delete、recoverable tombstones、explicit purge、sync
semantics、provider delete behavior、vault master key、多 unlock methods、
encrypted exports、HTTP/CLI purge/export 和 issue #6 case study。状态：已完成。

## L. Browser-first publishing (issue #8)

R-L1..R-L15 覆盖 GitHub Pages SPA 发布、browser-first docs、Pages workflow、
server discovery、Rust/JS backend guidance、case study 和 CI/CD alignment。状
态：已完成。

## M. 新手友好 UI (issue #10)

R-M1..R-M18 覆盖 connection guides、CORS-aware probes、theme toggle、tutorial
overlay、settings guidance、e2e coverage 和 issue #10 case study。状态：已完
成。

## N. Tutorial progress persistence (issue #13)

R-N1..R-N9 要求 tutorial refresh 后保持当前步骤、Next/Skip/Complete 的持久
化、重新打开时重置、case study、external research 和 root-cause note。状态：
已完成。

## O. Email support (issue #3)

R-N1..R-N10（该历史区段沿用原编号）覆盖 email research、archive import、
Gmail/Microsoft Graph/JMAP live receive/send、IMAP/POP3/SMTP local-server
fallback、HTTP routes、CLI/API surface 和 reproducing tests。状态：已完成。

## P. Provider connections (issue #16)

R-O1..R-O19 覆盖 Telegram/Facebook/WhatsApp 等 provider credential forms、
archive upload/paste import、settings surface、Connect first CTA、secret
storage、probe classification、CORS help、unit/integration/e2e tests 和 issue
#16 case study。状态：PR #17 仍记录为 in progress。

## Q. UI 和文档国际化 (issue #18)

R-Q1..R-Q10 覆盖 SPA language switcher、browser language detection、local
override persistence、`<html lang>`/`dir`、所有 authored UI strings 的
translation keys、dictionary parity tests、Markdown language switchers、
translated docs siblings、docs-language automation、issue #18 case study 和 PR
#19 single-PR delivery。状态：PR #19 in progress。

## U. Mobile-first UI 改造 (issue #25)

R-N1..R-N12 覆盖 mobile-first AppShell（bottom-nav / side-rail /
permanent drawer）、Apple Liquid Glass tokens 与
`prefers-reduced-transparency` fallback、完整的 translation 覆盖（non-EN
build 不会出现 English literal）、独立的 Connections 页面（每个 provider
一张 card 并带 `connected/not-connected/action-required` state badge）、
独立的 setup detail screen 与 per-provider `setupSteps[]`、anchored
tutorial spotlight，以及以 "Connect a service" 起步的默认 tutorial 序列。
状态：PR #26 in progress（分支 `issue-25-dac43a780b5c`）。详细表参见
[`docs/REQUIREMENTS.md`](./REQUIREMENTS.md) section U。

## Traceability

后续 PR 或 commit 完成功能时，请在 changeset 和 PR 描述中引用对应 `R-*`
ID，使本文件保持 live spec，而不是一次性快照。
