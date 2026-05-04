---
'meta-sovereign': minor
---

R-I1..R-I12: Localise the SPA shell, navigation, and every view in
English, Russian, Chinese, and Hindi. A new ~150-LOC i18n module ships
the four bundled dictionaries, detects the active locale via RFC 4647
§3.4 prefix matching against `localStorage.metaSovereignLocale` →
`navigator.languages` → `navigator.language` → `'en'`, and exposes a
header `<select>` (next to the theme toggle) so users can override the
detected choice or fall back to the system default. `<html lang>` and
`<html dir>` update on every locale change so screen readers and CJK
font fallbacks behave correctly. Translation parity across locales is
enforced by the new `js/tests/i18n.test.js` suite, which fails the
build if a key drifts. Provider names ("Telegram", "WhatsApp") and API
URLs stay in source form because they are proper nouns / brand
identifiers.

R-I11..R-I12 / R-Q7..R-Q8: Add hive-mind-style language-switcher H1s
and `zh` / `hi` / `ru` sibling files for the root README, changelog,
mobile README, top-level user-facing docs, and the issue-18 case-study
documents. `js/tests/docs-language.test.js` now enforces sibling
presence and switcher link resolution for that tracked Markdown surface.
