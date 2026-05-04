# Requirements extracted from issue #18 (languages: [en](requirements.md) • [zh](requirements.zh.md) • [hi](requirements.hi.md) • ru)

Каждый item имеет stable `R-I*` ID, чтобы changesets, PRs и code comments
могли ссылаться на requirement.

## R-I1 — User can switch UI language

SPA должна иметь language selector в header, не менее discoverable, чем
Theme toggle. Switching должно применяться immediately, без reload, и
persist across reloads.

Acceptance: header supports English, Chinese, Hindi, Russian; visible view
updates within one React render cycle; choice stored in `localStorage`.

## R-I2 — Auto-detect language from browser data on first visit

Когда explicit override отсутствует, SPA выбирает closest supported
locale по `navigator.languages` and `navigator.language`. If no match,
fallback to English.

Acceptance: `ru-RU` → `ru`, `hi-IN` → `hi`, `fr-FR` → `en`; detection runs
only when `metaSovereignLocale` is absent.

## R-I3 — Support English, Chinese, Hindi and Russian

Locale catalogue for this PR fixed at four. Every dictionary must cover
SPA shell user-facing strings.

Acceptance: `availableLocales` has exactly four entries; every dictionary
has the same key set as `en`.

## R-I4 — Persist chosen locale

"App data" means `localStorage`, same model as theme override. Explicit
pick wins until user clears it or chooses "System default".

Acceptance: override stored in `metaSovereignLocale`; system default option
clears override and re-runs detection.

## R-I5 — Update `<html lang>` and `<html dir>` on every change

`lang` is required for screen readers and CJK/Devanagari font selection.
`dir` prepares future RTL locales.

Acceptance: after `setLocale('zh')`, `lang === 'zh'` and `dir === 'ltr'`.

## R-I6 — Translate every authored user-facing SPA string

Header, nav, status, theme/language/tutorial toggles, tutorial overlay,
connection-guide copy, settings, operator, backup and similar strings
must use `t()`. Provider names and API identifiers remain source data.

## R-I7 — Locale switching must not regress theme toggle

Language switcher mirrors the theme toggle pattern, and both controls
coexist in narrow viewports.

## R-I8 — Tests cover detection, persistence, fallback and parity

Tests cover `detectInitialLocale()`, `setLocale()`, `clearLocale()`, `t()`,
fallback, `<html>` attributes, dictionary parity and switcher options.

## R-I9 — Single PR completion

All `R-I*` requirements land in PR #19 on branch
`issue-18-511583e63fad`.

## R-I10 — Document i18n surface in the case study

`docs/case-studies/issue-18/` contains `README.md`, `requirements.md`,
`solution-plan.md`, `components.md`, `external-research.md` and raw issue
data.

## R-I11 — Translate user-facing Markdown docs into four languages

Root `README`, `CHANGELOG`, `mobile/README`, top-level `docs/*.md` and the
issue-18 case-study docs introduced by this PR need `.zh.md`, `.hi.md`,
and `.ru.md` siblings. Historical case-study evidence remains archival
source material unless a future issue explicitly requests localising all
old artefacts.

## R-I12 — Add language switchers to Markdown documents

Every tracked Markdown H1 follows hive-mind convention: `(languages: ...)`,
current locale as plain text, other locales linked to sibling files.
`js/tests/docs-language.test.js` verifies sibling presence and link
resolution.
