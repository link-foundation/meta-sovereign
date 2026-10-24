---
'meta-sovereign': patch
---

Linux WebKit fixes (R-Z22): reduced visual effects switch transitions off instead of leaving a 0.01ms fade (which gave low-contrast text while the theme switched); the tutorial card never covers the control it points at (the target is scrolled into the space the card leaves free, and the card collapses when it cannot be), including with taller fonts; the card takes focus on every step even when the page grabs it back. Stored data is unchanged.
