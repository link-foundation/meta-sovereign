---
'meta-sovereign': patch
---

Tutorial progress is now versioned (`TUTORIAL_VERSION`) and force-reset when the tour changes. Saved progress from an older build no longer resumes onto a step that has since changed meaning — which is what made a Telegram selection resume onto the Email page after the tour was reworked. Bump `TUTORIAL_VERSION` whenever the steps or flow change and every user starts the new tour from the beginning.
