# Issue #18 external research (languages: [en](external-research.md) • [zh](external-research.zh.md) • hi • [ru](external-research.ru.md))

यह file i18n solution design करते समय consult किए गए external facts और
sources record करती है।

## 1. Browser language detection

`navigator.languages` (HTML Living Standard) preferred language tags की
array लौटाता है, descending preference order में। `navigator.language`
single preferred tag है और usually array का first item होता है।

References:

- https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-languages
- https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-language

Practical result: `detectInitialLocale()` पहले `navigator.languages` walk
करता है, फिर `navigator.language` fallback।

## 2. BCP-47 lookup

RFC 4647 §3.4 "Lookup" language priority list को supported tags से prefix
matching द्वारा match करता है। PR #19 matcher simplified version है: full
tag try करें, फिर right-side subtags strip करें, जैसे `zh-Hans-CN` →
`zh-Hans` → `zh`।

Reference: https://datatracker.ietf.org/doc/html/rfc4647#section-3.4

## 3. Plurals

English, Chinese, Hindi और Russian plural systems अलग हैं; Russian खासकर
complex है। Current SPA shell में grammatical plural-count strings नहीं
हैं। Counts labels के पास parentheses में आते हैं, इसलिए simple
key-to-string lookup sufficient है।

Reference: https://cldr.unicode.org/index/cldr-spec/plural-rules

## 4. `<html lang>` and fonts/screen readers

Browsers CJK glyph selection में `<html lang>` use करते हैं। Screen readers
भी सही pronunciation dictionary चुनने के लिए `lang` पर निर्भर करते हैं।
Hindi Devanagari आधुनिक OS fonts से render होती है, लेकिन `lang="hi"`
accessibility के लिए जरूरी है।

References:

- https://drafts.csswg.org/css-fonts-3/#font-language-override-prop
- https://www.w3.org/International/articles/language-tags/

## 5. RTL preparation

`en`, `zh`, `hi`, `ru` सभी LTR हैं, फिर भी `availableLocales` में `dir`
है और हर locale change पर apply होता है। Future `ar`, `he` या `fa` add
करने के लिए locale metadata add करना होगा, SPA-wide rewrite नहीं।

Reference: https://www.w3.org/International/questions/qa-html-dir

## 6. Translation methodology

Process:

1. SPA shell के authored English literals identify करें।
2. Stable namespaces design करें जैसे `nav.*`, `header.*`, `tutorial.*`।
3. Strings को Russian, Simplified Chinese और Hindi में translate करें, CLDR,
   W3C i18n material, common UI terminology और open-source app
   translations से compare करें।
4. Ambiguous source strings का context preserve करें ताकि future
   native-speaker review आसान हो।

Native-speaker review PR #19 का completion gate नहीं है; dictionary parity
और UI tests structural gaps रोकते हैं।

## 7. Platform matrix

Modern Chromium, Firefox, Safari, Capacitor iOS/Android और Electron
`navigator.languages`, `<html lang>` font behavior और `localStorage`
support करते हैं। Project target platforms इन APIs को cover करते हैं।
