# External research for issue #18

This file collects the external facts and references consulted while
designing the i18n solution. Each entry cites the upstream source so
future readers can re-verify the conclusion.

## 1. Browser language detection — what the standard says

### `navigator.languages` (HTML Living Standard, §8.7.2)

> The languages getter steps are to return a frozen array of language
> tags representing the user's preferred languages, in descending
> order of preference, ordered such that the most preferred language
> is the first item in the array.

Reference: https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-languages

Practical consequence: a user with system preferences set to
"Russian, English (US), German" exposes
`['ru', 'en-US', 'de']` (or similar; some browsers return primary
subtag form, some keep the region). The detection function in
`js/src/web/i18n.js` walks this array in order.

### `navigator.language`

> The user agent's preferred language.

A single tag. All four major browser engines ship it; the spec
mandates that it equals `navigator.languages[0]` when the array
exists.

Reference: https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-language

### BCP-47 prefix matching (RFC 4647 §3.4 "Lookup")

> The lookup algorithm produces a single result by matching the
> language priority list against the language ranges, in order. For
> each language priority list entry, the algorithm finds the first
> language range it matches against (with prefix matching) and
> returns the corresponding tagged element.

Reference: https://datatracker.ietf.org/doc/html/rfc4647#section-3.4

The matcher in `i18n.js` is a simplified RFC 4647 lookup: for each
candidate, try the full tag, then strip the right-most subtag and
retry, until a match against the available ids is found or the tag
is exhausted.

## 2. Plural and grammatical-gender rules per language

The four target locales have very different plural systems:

| Locale | Plural categories                                                                |
| ------ | -------------------------------------------------------------------------------- |
| `en`   | `one` (1), `other` (2+, 0)                                                       |
| `zh`   | `other` (no morphological plurals)                                               |
| `hi`   | `one` (0–1), `other` (2+); some forms differ in dialect                          |
| `ru`   | `one` (1, 21, 31, …), `few` (2–4, 22–24, …), `many` (0, 5–20, 25–30, …), `other` |

Reference: https://cldr.unicode.org/index/cldr-spec/plural-rules

Implication for PR #19: **none of the user-facing strings in the
SPA shell carry a count**, so we sidestep the plural-rules problem
entirely. The few places where the SPA does show counts
(`Contacts (47)`, `Facts (12)`) put the number in parens after the
label, which reads correctly in all four target languages without
plural agreement.

## 3. CJK font selection and `<html lang>`

WebKit, Blink, and Gecko all use the `<html lang>` attribute to pick
between CJK font variants when the same Unicode code point is shared
across Han variants (e.g. U+4E2D 中 has different preferred glyphs in
Simplified Chinese vs. Traditional Chinese vs. Japanese). Without
`<html lang>`, the browser falls back to the system locale's preferred
script, which often produces visually wrong glyph shapes.

Reference: https://drafts.csswg.org/css-fonts-3/#font-language-override-prop

This is why `applyLocale()` in `i18n.js` updates
`document.documentElement.lang` even though our CSS doesn't set
`font-language-override` — the browser default font stack picks the
right font for free once `lang` is correct.

## 4. Devanagari rendering and screen readers

Hindi text in Devanagari script renders correctly without any
extra fonts on macOS (Devanagari MT), Windows 10+ (Mangal /
Nirmala UI), and most Linux distros (Lohit Devanagari, Noto
Devanagari). Screen readers (VoiceOver, NVDA, TalkBack) all pick
the correct phoneme dictionary based on `<html lang="hi">`, so
setting `lang` is the single most important accessibility step
when shipping Hindi UI.

Reference: https://www.w3.org/International/articles/language-tags/

## 5. RTL preparation (future-proofing)

None of `en`, `zh`, `hi`, `ru` are RTL languages. The `dir`
attribute is still updated on every locale change so a future
addition of `ar`, `he`, or `fa` becomes a one-line change in
`availableLocales` instead of a SPA-wide CSS audit.

The `dir` value comes from `availableLocales[i].dir` (currently
`'ltr'` for all four), so adding `{ id: 'ar', label: 'العربية',
dir: 'rtl' }` is the only addition needed when an RTL language
joins the catalogue. The SPA's existing `flex` layouts already
honour `dir` automatically.

Reference: https://www.w3.org/International/questions/qa-html-dir

## 6. Translation methodology

The four dictionaries are produced by:

1. Identifying every English literal the user can see in the SPA
   shell (header, nav, tutorial, view headings, common buttons,
   empty-state copy).
2. Authoring the translation key namespace (`nav.*`, `header.*`,
   `tutorial.*`, …) so the keys remain stable when the literal
   English strings are reworded.
3. Translating each string into Russian (translator: native
   speaker), Chinese Simplified (`zh-Hans`), and Hindi using a
   combination of the developer's own knowledge, well-established
   reference dictionaries (CLDR root-locale data, Wiktionary,
   English-Russian "phrasebook" patterns from
   github.com/saimn/awesome-i18n), and review against parallel
   software (Telegram Desktop's published translation files for
   `ru`, `zh`, and `hi`, available at
   https://github.com/telegramdesktop/tdesktop, which use
   compatible BCP-47 tags and similar UI vocabulary).

Native-speaker review is **out of scope for PR #19** but the
strings are tagged inline with translator notes (`// note:` in the
dictionary files) where the source string was ambiguous, so a
follow-up review issue can find the spots that need a second pass.

## 7. Supported-locale matrix per platform

| Platform            | `navigator.languages` available | `<html lang>` honoured for fonts | `localStorage` |
| ------------------- | ------------------------------- | -------------------------------- | -------------- |
| Chromium 49+        | ✅                              | ✅                               | ✅             |
| Firefox 32+         | ✅                              | ✅                               | ✅             |
| Safari 10.1+        | ✅                              | ✅                               | ✅             |
| Capacitor (iOS)     | ✅                              | ✅                               | ✅             |
| Capacitor (Android) | ✅                              | ✅                               | ✅             |
| Electron            | ✅                              | ✅                               | ✅             |

The SPA's minimum target (Node 20, modern Chromium / Safari /
Firefox per `package.json` engines) covers every platform that
exposes the APIs we depend on.
