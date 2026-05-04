# Issue #18 से निकली requirements (languages: [en](requirements.md) • [zh](requirements.zh.md) • hi • [ru](requirements.ru.md))

हर item stable `R-I*` ID रखता है ताकि changesets, PRs और code comments उसे
reference कर सकें।

## R-I1 — User UI language switch कर सके

SPA header में Theme toggle जितना discoverable language selector होना चाहिए।
Switch immediate हो, page reload न चाहिए, और reload के बाद choice बनी रहे।

Acceptance: header English, Chinese, Hindi, Russian support करे; visible
view one React render cycle में update हो; choice `localStorage` में जाए।

## R-I2 — First visit पर browser data से language detect करें

जब user override न हो, SPA `navigator.languages` और fallback
`navigator.language` से closest supported locale चुने। कोई match न हो तो
English।

Acceptance: `ru-RU` → `ru`, `hi-IN` → `hi`, `fr-FR` → `en`; detection केवल
तब चले जब `metaSovereignLocale` absent हो।

## R-I3 — English, Chinese, Hindi, Russian support

इस PR में locale catalogue चार languages का है। हर dictionary SPA shell के
user-facing strings cover करे।

Acceptance: `availableLocales` exactly four entries; every dictionary same
key set as `en`।

## R-I4 — Chosen locale persist करें

"App data" का अर्थ `localStorage` है, same model as theme override। Explicit
pick तब तक wins जब तक user उसे clear न करे या "System default" न चुने।

Acceptance: override `metaSovereignLocale` में stored; system default option
override clear करके detection फिर run करता है।

## R-I5 — हर change पर `<html lang>` और `<html dir>` update

`lang` screen readers और CJK/Devanagari font selection के लिए जरूरी है।
`dir` future RTL locales के लिए readiness है।

Acceptance: `setLocale('zh')` के बाद `lang === 'zh'` और `dir === 'ltr'`।

## R-I6 — SPA shell के सभी authored user-facing strings translate करें

Header, nav, status, theme/language/tutorial toggles, tutorial overlay,
connection-guide copy, settings, operator, backup आदि strings `t()` से आएं।
Provider names और API identifiers original रहें।

## R-I7 — Locale switching theme toggle को regress न करे

Language switcher theme toggle के pattern का mirror है और दोनों controls
narrow viewport में साथ रह सकें।

## R-I8 — Detection, persistence, fallback और parity tests

Tests `detectInitialLocale()`, `setLocale()`, `clearLocale()`, `t()`,
fallback, `<html>` attributes, dictionary parity और switcher options cover
करें।

## R-I9 — Single PR completion

सभी `R-I*` PR #19 में branch `issue-18-511583e63fad` पर land हों।

## R-I10 — Case study में i18n surface document करें

`docs/case-studies/issue-18/` में `README.md`, `requirements.md`,
`solution-plan.md`, `components.md`, `external-research.md` और raw issue
data हो।

## R-I11 — User-facing Markdown docs को चार languages में translate करें

Root `README`, `CHANGELOG`, `mobile/README`, top-level `docs/*.md` और इस
PR के issue-18 case-study docs को `.zh.md`, `.hi.md`, `.ru.md` siblings
चाहिए। Historical case-study evidence archival source material रहता है जब
तक future issue सभी पुराने artefacts localise करने को न कहे।

## R-I12 — Markdown docs में language switcher

हर tracked Markdown H1 hive-mind convention follow करे: `(languages: ...)`,
current locale plain text, बाकी locales sibling files से linked।
`js/tests/docs-language.test.js` sibling presence और link resolution verify
करता है।
