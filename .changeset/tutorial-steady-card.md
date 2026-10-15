---
'meta-sovereign': patch
---

Tutorial: the card no longer jumps while the page scrolls. It is placed once in the frame its target scrolls in — beside a target on the page it scrolls with it in the same frame, beside a section taller than the screen (or docked) it stays put on the screen — instead of CSS anchor positioning clamped to the screen, which snapped back in Safari and scrolled away in Chrome. When a scroll leaves the card off screen with its target still on it, the card glides to a better side once the scroll ends.
