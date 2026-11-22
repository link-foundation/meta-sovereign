# Issue 73 case study

[Issue #73](https://github.com/link-foundation/meta-sovereign/issues/73) asks for a cloud-hosted, browser-only experience, a SaaS-ready server mode, easy rebranding, and a researched, implemented plan in one [pull request](https://github.com/link-foundation/meta-sovereign/pull/74).

The original issue and feedback are archived in [data](data/). The issue had zero comments and zero sub-issues at the initial review. PR 74 had zero conversation comments, inline comments and reviews. [PR #38](https://github.com/link-foundation/meta-sovereign/pull/38) is prior work on the static Pages app, local server discovery and packaged desktop clients.

## Starting point

- The JS server implements real source adapters, event streaming, sync, media, scheduled jobs and a file-backed store. `serve` starts a loopback service, accepts a Pages origin, optionally offers a local certificate and can find credentials and browser sessions beside the user. `startServer` configures several process-wide resources, including email attachment storage.
- The Pages UI discovers a local server or opens a browser store. It mirrors links and suggestions for offline use. A URL exposed on a public port would inherit local trust assumptions and could serve application data without an owner check. The Rust server stores links in memory and lacks the JS provider and automation services. [Server parity](../../SERVER-PARITY.md).
- Device-based sign-in discovery opens an installed browser or reads local profiles and credential files. A cloud browser tab has no access to another device's OS address book or browser profiles. Hosted operations can instead use same-origin forms, uploads, native APIs and server jobs where the app already implements them.
- T3 Code applies semantic appearance tokens across shared navigation. Telegram Web A's chat list distinguishes lists with known chats from initial loading. The hosted shell reuses the app's Chat and Operator behavior and applies the configured brand accent through the existing theme tokens. [T3 Code theme palette](https://github.com/pingdotgg/t3code/blob/08a463e29976617134de01e9341f898bc881d0eb/apps/web/src/themePalette.ts) · [Telegram Web A chat list](https://github.com/Ajaxy/telegram-tt/blob/6002824b6532f3d913997ce496d9ab5f9b86bc22/src/components/left/main/ChatList.tsx#L192) · [Product vision](../../PRODUCT-VISION.md) · [Pinned chat references](../../CHAT-REFERENCES.md).

See the [requirements and solution plan](solution-plan.md) for tradeoffs, implementation and verification, the [online research](external-research.md) for primary sources, and the [operator guide](../../CLOUD-WORKSPACES.md) for the deployment and recovery procedure.
