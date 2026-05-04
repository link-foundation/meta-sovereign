# Case Study: Issue #18 — UI i18n для en, zh, hi, ru (languages: [en](README.md) • [zh](README.zh.md) • [hi](README.hi.md) • ru)

**Issue:** [#18 — Support i18n of UI for en, ch, hi, and ru](https://github.com/link-foundation/meta-sovereign/issues/18)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-18-511583e63fad`
**Pull Request:** [#19](https://github.com/link-foundation/meta-sovereign/pull/19)

Этот case study собирает directives из issue #18 и follow-up comments PR
#19, раскладывает их на atomic requirements `R-I*`, фиксирует external
research и component/standard survey, а также описывает solution, который
PR #19 реализует в рамках local-first / privacy-first constraints.

## Artefacts

| File                   | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `README.md`            | Main case-study analysis.                     |
| `requirements.md`      | Atomic requirements from issue/comments.      |
| `solution-plan.md`     | Requirements → PR #19 deliverables mapping.   |
| `components.md`        | Upstream tools, standards and precedents.     |
| `external-research.md` | Browser language detection and i18n research. |
| `data/`                | Raw issue/comment artefacts.                  |

## 1. Vision

В SPA уже есть theme toggle, который persists in
`localStorage.metaSovereignTheme`. Issue требует такой же language
switcher: на first visit language определяется по browser/app data, затем
user может переключаться между English, Chinese, Hindi и Russian, а выбор
persist.

Issue использует `ch` для Chinese, но browsers и BCP-47/ISO 639-1
используют canonical code `zh`. PR #19 применяет `zh` (Simplified
Chinese / `zh-Hans`) in code, storage and docs filenames.

## 2. Method

1. Issue data captured via `gh` in `data/issue-18.json`.
2. `requirements.md` decomposes `R-I1..R-I12`.
3. `external-research.md` records `navigator.languages`, BCP-47 lookup,
   `<html lang>`, plural rules and libraries.
4. `components.md` compares internal precedent (`useTheme()`, tutorial
   overlay) and external libraries (`i18next`, `react-intl`, `lingui`,
   `polyglot.js`).
5. `solution-plan.md` maps requirements to i18n module, dictionaries, SPA
   wiring, tests and docs localisation.

## 3. Why an in-house module

`i18next` и `react-intl` license-compatible, но слишком heavy для current
static SPA. PR #19 ships `js/src/web/i18n.js`: small pure-JS module with
`t(key, vars)`, `useLocale()`, `setLocale()`, browser detection,
localStorage persistence, `<html lang|dir>` updates и four bundled
dictionaries. Surface intentionally compatible with a future
`i18next`/FormatJS migration.

## 4. Constraints

- Privacy-first: locale preference хранится только в `localStorage`.
- Offline-first: all dictionaries ship in bundle; switching has no network.
- Accessibility: `<html lang>` и `dir` update on every change.
- Browser-first detection: `navigator.languages` → `navigator.language` →
  `en` fallback; explicit override wins.
- Single PR: all work lands in PR #19.

## 5. Outcome

PR #19 ships:

- `js/src/web/i18n.js` i18n core;
- `en`, `zh`, `hi`, `ru` dictionaries;
- header language switcher and "System default" option;
- `t()`-based SPA shell, views, tutorial, settings and connection guides;
- `js/tests/i18n.test.js` parity/detection/persistence tests;
- four-language Markdown siblings for root `README`, `CHANGELOG`,
  `mobile/README`, top-level docs and this issue-18 case study;
- `js/tests/docs-language.test.js` for hive-mind-style language switchers.
