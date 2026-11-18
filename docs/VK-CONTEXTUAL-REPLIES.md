# Contextual personal VK replies

Four presets in **Automations** prepare replies to personal incoming messages. Each starts disabled in safe mode. Incoming and scheduled runs prepare drafts for review.

| Preset                            | Qualifying incoming message and context                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Ask whether previously acquainted | Exactly two recorded messages: your greeting followed by their greeting, using recognized text or VK greeting stickers. |
| Reply to well-being questions     | A complete Russian or English well-being question, such as “Как дела?” or “How are you?”.                               |
| Reply to purpose questions        | A complete “Ты что-то хотел?” or “Вы что-то хотели?” question.                                                          |
| Clarify an unspecified question   | A bare question such as “?” or “М?” immediately after your outgoing personal message.                                   |

Edit formal/informal text, optional alternative replies and the cooldown in the existing editor. Separate alternatives with blank lines, with at most 32 entries per form and 4096 characters per entry. The chosen alternative stays stable for an incoming message across previews and address overrides. Empty lists use the ordinary text. Explicit owner edits carry forward; reset restores catalog selection. The default cooldown is one rolling day per chat after acknowledged delivery. Pending or uncertain delivery remains reserved.

```sh
meta-sovereign automations plan first-exchange
meta-sovereign automations plan wellbeing
meta-sovereign automations plan purpose
meta-sovereign automations plan clarification
meta-sovereign automations drafts
```

Planning and offline review never send. Confirm the exact draft through the ordinary review controls. CLI and default text/binary Lino APIs expose the same configuration, plans, confirmation and status. Actual delivery requires a configured VK sender and a positive acknowledgement.

Groups, communities, outgoing, service and deleted messages do not qualify. Additional questions, ambiguous ordering and intervening incoming messages refuse. First-exchange detection describes the recorded history; it cannot establish that a partially imported conversation has never happened before. Its draft freezes the exact two records and checks the stored count again before typing and after outbox admission. Clarification freezes the adjacent outgoing turn as well as the latest incoming message. Changed history, saved actions or reply content require fresh review. Restart recovers saved drafts without sending them.

[Reference audit, reproduction and verification](case-studies/issue-56/vk-contextual.md).
