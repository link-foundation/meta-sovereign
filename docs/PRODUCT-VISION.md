# Product vision and UI guidance

meta-sovereign is a local workspace for communicating as a person or an
organisation across messaging systems. A user should be able to understand a
conversation, reply, and continue working without managing connection recovery
or learning a different interaction for every provider.

## Two reference points

**T3 Code guides visual style and configurability.** Learn from its restrained
surfaces, consistent alignment, reusable controls, theme tokens, typography,
contrast settings, searchable appearance controls and explicit reset actions.
Prefer a calm professional default: neutral dark surfaces, monochrome icons
and notification badges, consistent nonzero control gaps, and persistent
resizable columns. Color should communicate meaning. User content, including
avatars and emoji, retains its own appearance. Preferences should be discoverable,
persistent and reversible; optional workload distractions stay off by default.

**Telegram guides the baseline messaging features and interactions.** Reply and
quoted reply, delivery state, message menus, full-row selection, copying,
forwarding, editing/deleting where supported, media loading, drafts, unread
navigation, search and history scrolling belong to the common messaging
experience. Apply those expectations across Chat, Operator and all providers.
Provider adapters expose real capabilities and precise limitations; a missing
provider capability must never be presented as a successful action. The feature
matrix remains the record of implementation status, not a claim of universal
parity today.

Source comparisons and commit-pinned references are in
[Chat References](CHAT-REFERENCES.md). Read external implementations to learn
behavior and design decisions, then write original code; do not paste their
implementation into this repository.

## Interaction rules

- Keep interactions local and immediate: selecting a cached chat, choosing a
  folder, typing and queuing a message must not wait for a network response.
  Show the outgoing bubble and directory preview as pending before delivery is
  acknowledged. Keep long lists bounded to the viewport, reuse unchanged rows,
  and index related records once instead of scanning the directory per row.
  Preserve keyboard navigation, pinned order, date groups and interface scaling.
- A context menu clearly highlights the message or album it acts on while the
  menu is open. Dismissal removes that temporary highlight. The menu includes
  **Select** to enter persistent multi-selection. A context-menu target and a
  multi-selection are distinct states; opening a menu does not silently change
  the user's selected set. Selection fills the row, and checks stay outside the
  stable message column.
- A mention, search result, pinned message or reply link leads to the actual
  message. Load its surrounding history automatically when needed and briefly
  highlight it, including when already visible. A failed jump must not consume
  its queue entry or mark unseen content as read.
- Each message has one legible delivery status beside its timestamp. Invisible
  layout placeholders must remain invisible, including animated descendants.
  Pending, retrying, sent, read, failed and uncertain outcomes remain distinct.
- Keep saved content and queued work through interruptions. Recover connections
  and reads automatically with bounded backoff and no manual retry requirement.
  Reuse idempotency keys for safe send retries; preserve uncertainty when a
  provider cannot confirm a send. A live local server and a reconnecting
  provider are different diagnostic conditions, reported by the shared header
  status without blocking the conversation with redundant banners.
- Operator keeps the current card until **Done**. **Next** postpones it without
  acknowledging messages. Its defaults target unread private conversations
  with people; other item types are explicit settings.
- Reserve only the floating composer's actual height beneath messages, with a
  small consistent gap. Replies, suggestions, pane resizing and interface scale
  must not create a blank footer or cover the last message. Preserve a reader's
  position away from the live tail. An opening unread divider stays in place
  during partial reads, then retires when those messages are confirmed read;
  new live arrivals must not revive that old divider.
- Preserve keyboard access, visible focus, readable contrast and reduced-motion
  behavior through themes, pane widths and screen sizes. Reuse common components
  so the same rules apply throughout the app.
- Learn conversation context from source-backed facts, reciprocal agreements,
  questions and explicit reply threads across providers. Distinguish observed
  usage, confirmed answers, negative answers and uncertainty. Suggestions may
  continue an earlier topic and must avoid re-asking for a known profile. These
  read-only rules default on with persistent opt-outs; selecting a suggestion
  only fills the composer. Keep analysis bounded and expose evidence and partial
  history. See [conversation learning](CONVERSATION-LEARNING.md).
- Distinguish retrieved sent messages, context suggestions and generated word
  predictions visibly. Never present a generated continuation or its word
  frequency as a sentence the user previously sent. Keep multiline drafts
  visible up to the composer's height limit before scrolling their contents.
  Suggestions remain previews until an option is explicitly activated. Tab
  navigates focus; it never accepts the first suggestion. Omit word completions
  that save fewer than three letters of typing and predictions after a finished
  sentence. Keep user-written and saved drafts intact through suggestion updates.

## Review and evidence

For a UI or messaging change, compare the relevant source references, describe
the intended behavior and verify the affected shared components. Treat spacing,
loading, recovery, message targeting and data preservation as functional
requirements. Record material provider limitations in the feature matrix.

Run only focused, low-concurrency tests locally using temporary fixtures. Full
suites, stress checks and complete browser/runtime matrices run in GitHub CI/CD;
never use a person's live conversations as test fixtures. See
[UI states](UI-STATES.md), [connection recovery](CONNECTION-RECOVERY.md) and
[contributor guidance](CONTRIBUTING.md).
