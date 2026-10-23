---
'meta-sovereign': patch
---

Emoji found by words in the page's language (R-Y117), as Telegram's apps: the emoji panel's search uses Telegram's own emoji keywords (messages.getEmojiKeywords, kept a day per language) before English names. New route `POST /api/telegram/emoji-keywords {lang}`. Lint, format and duplication checks now skip `.claude/` (Claude Code's worktrees).
