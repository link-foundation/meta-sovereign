# Issue 75 · Automatic continuation of messages in public chats

Issue 75 asks to let someone keep sending short follow-ups while reducing the number of separate posts visible to everyone in a public chat. It also asks for issue data, external research, alternatives and an implemented plan in one pull request. [Issue #75](https://github.com/link-foundation/meta-sovereign/issues/75) · [PR #76](https://github.com/link-foundation/meta-sovereign/pull/76).

[Data](data/) records the issue and opening PR description. The issue had no comments or sub-issues and the PR had no conversation comments, inline comments or reviews when collected.

## Repository evidence

- Chat and Operator use the same composer and persistent outgoing queue. The queue already sends one draft at a time within a conversation and carries a client ID across reloads. A parallel tab has its own queue. The existing server route confirms the exact request and deduplicates its client ID. [Shared composer](../../../js/src/web/chat-live.js) · [Server send route](../../../js/src/server/routes-automations.js) · [Prior composer work](https://github.com/link-foundation/meta-sovereign/pull/34).
- The existing Telegram actions turn provider edit updates into replacements for the same stored message ID. Message metadata and history then show the edit in either view. The composer also supports cached history and hidden senders, so its last visible bubble can be older than the actual newest post. [Telegram actions](../../../js/src/sources/telegram-actions.js) · [Live updates](../../../js/src/sources/telegram-account-live.js) · [Sender filtering work](https://github.com/link-foundation/meta-sovereign/pull/72).
- Telegram user accounts already expose the full channel and the message edit RPC. Telegram bot sessions and browser fallback lack the same authoritative history-and-author check. The provider matrix documents the other networks' send scopes. [Telegram capability matrix](../../FEATURES.md) · [Provider research](external-research.md).
- The Settings view already uses accessible checkbox rows, headings, subdued descriptions and preferences kept on the current browser. The hosted shell uses the same screens as the local application. [Settings](../../../js/src/web/settings-view.js) · [Product vision](../../PRODUCT-VISION.md) · [Hosted shell work](https://github.com/link-foundation/meta-sovereign/pull/74).

The [solution plan](solution-plan.md) maps each request to implementation and verification. [Online research](external-research.md) records the APIs, libraries and pinned client references used in the decision.
