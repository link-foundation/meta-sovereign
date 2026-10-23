---
'meta-sovereign': patch
---

Animated stickers play (R-Y113), as Telegram's apps: a `.tgs` sticker in a chat or in the sticker panel shows its picture, then its Lottie animation drawn as SVG by lottie-web's light player (bundled; no eval, no workers, so the content policy stands), looping while on screen and still when off it or when less motion is asked for. The panel's `sticker?full=1` now also serves an animated sticker's animation.
