---
'meta-sovereign': patch
---

Tutorial advances when a service actually connects, and the "confirmed with
Telegram" check mark gets a reliable tooltip.

- The connect step no longer gets stuck: finishing a connection — a saved
  session, a phone login, a bot token or API keys — now advances the tour
  past it, however the user connected. Connect paths dispatch a
  `meta-sovereign:connected` event and the step listens for it
  (`completeOnConnect`). `TUTORIAL_VERSION` is bumped to 4.
- The verified check mark now shows a styled CSS tooltip on hover and
  keyboard focus instead of the native `title`, which was slow to appear and
  easy to miss. An `aria-label` keeps the words available to screen readers.
