# Ordered VK acquaintance replies

**Follow up a negative acquaintance answer** in Automations prepares one review containing two steps: a VK sticker, then your introduction. The preset starts disabled in safe mode. It requires your actual adjacent outgoing “Мы общались ранее?” question and a complete personal negative answer such as “Нет”, “Не помню” or “Вряд ли”. Groups, additional questions, deleted/service messages and ambiguous ordering refuse.

Choose positive VK sticker IDs (the reference default is `59431`), informal/formal introductions and optional alternative introductions. Separate alternatives with blank lines; each form accepts up to 32 entries of 4096 characters. The chosen sticker and introduction remain stable for the same incoming message. Preview, CLI, offline editing and scheduled runs prepare drafts without sending.

```sh
meta-sovereign automations plan engagement
meta-sovereign automations drafts
```

The shared plan, Chat and Operator show both steps in order, with separate delivery states. Confirming the reviewed draft authorizes that exact pair. Routing, sticker, introduction, address form and message evidence are frozen. The latest personal conversation, saved policy and opt-out list are checked before each provider effect.

A positive VK API message ID is retained separately for each step. The introduction starts only after the sticker acknowledgement is durably saved. If the sticker is acknowledged but the introduction definitely fails, the review retains **Sent** for the sticker and **Not delivered; review before retrying** for the text. Reloading or restarting sends nothing. Review the unchanged pair again to retry only the failed text. The default one-day per-chat cooldown applies after acknowledged delivery.

A timeout, interrupted dispatch or response without a positive API message ID remains **Unknown**. Inspect the outbox and actual conversation before deciding what happened; the sequence never automatically repeats an uncertain or acknowledged step. A browser-only response without the required API acknowledgement cannot automatically continue to the introduction. Missing saved receipts, changed conversations or edits to a partially delivered pair stop continuation and require manual checking.

[Reference audit and verification evidence](case-studies/issue-56/vk-engagement.md).
