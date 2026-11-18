# Gratitude replies

Open **Automations → Reply to gratitude**. The preset starts disabled and in safe mode. It recognizes complete Russian/English gratitude variants and the 38 gratitude stickers from the pinned VK reference. It only offers the latest unanswered incoming message in a personal VK user dialog. Groups, communities, owner messages, unknown text and ambiguous timestamps do not qualify, including when testing from a chat menu.

Choose **Reply with a VK sticker** and comma-separated response IDs, or turn it off and edit the formal/informal text variants. The preview shows the actual fixed sticker ID. Sending a sticker requires VK API access and access to its pack; browser fallback refuses an unsupported sticker. Entering text into a pending sticker draft or changing its address form selects text instead. Nothing is sent by previewing, saving, scheduling or receiving a message: those runs prepare drafts. Confirm each safe-mode draft, or explicitly confirm the exact preview in manual auto mode. Existing pacing, opt-outs, daily caps and durable outbox protection still apply.

The incoming message is checked again before sending, including after typing and outbox admission. A new message, edit, deletion or owner reply requires renewed review. Pending drafts and their exact message evidence survive a Lino store reopen; recovery never sends by itself.

The same settings are available through `automations save <file.lino>`, `automations plan gratitude`, `automations run gratitude` and `automations review`, and the existing `/api/automations` routes using default text or binary Links Notation. For example, an action contains `kind: reply-gratitude`, `preferSticker: true`, `stickerIds: [60075, 89452]`, and your `templates.formal` / `templates.informal`; its incoming trigger contains `recognizer: gratitude`. CLI previews identify a sticker explicitly. Set `preferSticker: false` to use your text variants.

The preset recognizes imported or received messages through the shared automation scheduler. Continuous authenticated VK provider watching and the other reference features remain separate entries in the issue #56 acceptance inventory.
