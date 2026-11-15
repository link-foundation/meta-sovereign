# Personal VK acquaintance replies

The **Reply to acquaintance questions** preset answers complete private incoming questions such as “Мы знакомы?” or “Мы знакомы с тобой/вами?”. It starts disabled in safe mode. Incoming and scheduled runs prepare drafts for review; they do not send automatically.

Open **Automations**, select this preset and edit your formal/informal introduction and cooldown. The default introduction says you are a programmer; replace it with your own words. Optional introduction lists vary replies: separate entries with a blank line (at most 32 per form, 4096 characters each). Selection stays stable for the same incoming message, including repeated previews and address overrides; empty lists use the ordinary text. A confirmed generated alternative keeps the catalog active, while an explicit owner edit carries forward through the existing edit/reset controls. The default cooldown is one rolling day per chat and survives restart after acknowledged delivery. Changing the cooldown is explicit and reversible. The existing address selector uses evidenced conversation history or your chosen override. Groups, communities, outgoing/service/deleted messages, extra questions and uncertain ordering do not qualify, including from a chat-menu test.

```sh
meta-sovereign automations plan acquaintance
meta-sovereign automations run acquaintance
meta-sovereign automations drafts
```

Use the existing draft review to confirm the exact text. Preview and offline planning never send. Pending drafts, receipts and cooldowns use the same durable store as other automations. Restart reveals saved work without sending it. A newer incoming message, owner reply or changed saved action invalidates the draft before typing and again after outbox admission. Uncertain delivery stays reserved by the outbox.

The normal automation API exposes the same preset, planning, configuration, draft confirmation and status through default text/binary Lino. The localized shared editor also works offline; actual VK delivery needs a configured supported sender and positive acknowledgement. Native UI checks use owned fixtures, and adapter tests use a mocked VK endpoint; these checks do not certify an authenticated VK account.

[Reproduction, reference audit and verification](case-studies/issue-56/vk-acquaintance.md).
