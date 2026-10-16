---
'meta-sovereign': patch
---

Telegram credential finder: list user accounts before bots; show every
location a credential was found with the shortest path first and the rest
behind an expandable "+N more" toggle; reveal a little of both ends of a
masked token/session hint (first three and last three characters);
replace the "confirmed with Telegram" text with a small check-mark icon
whose words live in its tooltip (shared `VerifiedMark`). Fix the tutorial
spotlight ring floating over the top menu bar by keeping the header above
the overlay. Document these as durable UI conventions (R-Y1..R-Y10 in
docs/REQUIREMENTS) and exclude the generated CHANGELOG.md from the
duplication gate so release automation can no longer trip it.
