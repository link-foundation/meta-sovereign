# External research for issue #18 (languages: [en](external-research.md) • [zh](external-research.zh.md) • [hi](external-research.hi.md) • ru)

Файл фиксирует external facts and references, consulted while designing
the i18n solution.

## 1. Browser language detection

`navigator.languages` (HTML Living Standard) returns array of preferred
language tags in descending preference order. `navigator.language` is a
single preferred tag and usually equals first array item.

References:

- https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-languages
- https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-language

Practical result: `detectInitialLocale()` walks `navigator.languages`
first, then falls back to `navigator.language`.

## 2. BCP-47 lookup

RFC 4647 §3.4 "Lookup" matches language priority list against supported
tags by prefix matching. PR #19 matcher is simplified: try full tag, then
strip right-side subtags, e.g. `zh-Hans-CN` → `zh-Hans` → `zh`.

Reference: https://datatracker.ietf.org/doc/html/rfc4647#section-3.4

## 3. Plurals

English, Chinese, Hindi and Russian have different plural systems;
Russian is especially complex. Current SPA shell has no grammatical
plural-count strings. Counts appear in parentheses near labels, so simple
key-to-string lookup is enough.

Reference: https://cldr.unicode.org/index/cldr-spec/plural-rules

## 4. `<html lang>` and fonts/screen readers

Browsers use `<html lang>` for CJK glyph selection. Screen readers rely on
`lang` to choose pronunciation dictionary. Hindi Devanagari renders with
modern OS fonts, but `lang="hi"` remains central for accessibility.

References:

- https://drafts.csswg.org/css-fonts-3/#font-language-override-prop
- https://www.w3.org/International/articles/language-tags/

## 5. RTL preparation

`en`, `zh`, `hi`, `ru` are all LTR, but `availableLocales` still carries
`dir` and applies it on every locale change. Future `ar`, `he` or `fa`
can be added by metadata, not a SPA-wide rewrite.

Reference: https://www.w3.org/International/questions/qa-html-dir

## 6. Translation methodology

Process:

1. Identify all authored English literals in SPA shell.
2. Design stable namespaces like `nav.*`, `header.*`, `tutorial.*`.
3. Translate strings into Russian, Simplified Chinese and Hindi, checking
   CLDR, W3C i18n material, common UI terminology and open-source app
   translations.
4. Preserve context for ambiguous source strings so future native-speaker
   review is easier.

Native-speaker review is not a PR #19 completion gate; dictionary parity
and UI tests prevent structural gaps.

## 7. Platform matrix

Modern Chromium, Firefox, Safari, Capacitor iOS/Android and Electron
support `navigator.languages`, `<html lang>` font behavior and
`localStorage`. Project target platforms satisfy these API assumptions.
