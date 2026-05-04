# Case Study: Issue #18 — en, zh, hi, ru UI i18n support (languages: [en](README.md) • [zh](README.zh.md) • hi • [ru](README.ru.md))

**Issue:** [#18 — Support i18n of UI for en, ch, hi, and ru](https://github.com/link-foundation/meta-sovereign/issues/18)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-18-511583e63fad`
**Pull Request:** [#19](https://github.com/link-foundation/meta-sovereign/pull/19)

यह case study issue #18 और PR #19 follow-up comments की directives collect
करती है, उन्हें `R-I*` atomic requirements में तोड़ती है, external
research और component/standard survey record करती है, और दिखाती है कि PR
#19 existing local-first / privacy-first constraints में solution कैसे
ship करता है।

## Artefacts

| File                   | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `README.md`            | Main case-study analysis।                    |
| `requirements.md`      | Issue/comment से निकाली atomic requirements। |
| `solution-plan.md`     | Requirements → PR #19 deliverables mapping।  |
| `components.md`        | Upstream tools, standards और precedent।      |
| `external-research.md` | Browser language detection और i18n research। |
| `data/`                | Raw issue/comment artefacts।                 |

## 1. Vision

SPA में theme toggle पहले से है और choice
`localStorage.metaSovereignTheme` में persist होती है। Issue उसी model पर
language switcher मांगता है: first visit पर browser/app data से language
detect करें, फिर user English, Chinese, Hindi और Russian में switch कर
सके और choice persist हो।

Issue Chinese के लिए `ch` लिखता है, लेकिन browsers और BCP-47/ISO 639-1
canonical code `zh` use करते हैं। PR #19 code, storage और docs filenames
में `zh` (Simplified Chinese / `zh-Hans`) use करता है।

## 2. Method

1. `gh` से issue data `data/issue-18.json` में capture किया गया।
2. `requirements.md` में `R-I1..R-I12` decompose किए गए।
3. `external-research.md` में `navigator.languages`, BCP-47 lookup,
   `<html lang>`, plural rules और libraries record हुईं।
4. `components.md` ने internal precedent (`useTheme()`, tutorial overlay)
   और external libraries (`i18next`, `react-intl`, `lingui`, `polyglot.js`)
   compare किए।
5. `solution-plan.md` requirements को i18n module, dictionaries, SPA wiring,
   tests और docs localisation से map करता है।

## 3. In-house module क्यों

`i18next` और `react-intl` license-compatible हैं, पर current static SPA के
लिए size और complexity अधिक है। PR #19 `js/src/web/i18n.js` ship करता है:
small pure-JS module with `t(key, vars)`, `useLocale()`, `setLocale()`,
browser detection, localStorage persistence, `<html lang|dir>` updates और
four bundled dictionaries। Surface future `i18next`/FormatJS migration के
लिए intentionally compatible subset है।

## 4. Constraints

- Privacy-first: locale preference केवल `localStorage` में रहती है।
- Offline-first: चारों dictionaries bundle में हैं; switch में network नहीं।
- Accessibility: हर change पर `<html lang>` और `dir` update होते हैं।
- Browser-first detection: `navigator.languages` → `navigator.language` →
  `en` fallback; explicit override wins।
- Single PR: सारा work PR #19 में land होता है।

## 5. Outcome

PR #19 ships:

- `js/src/web/i18n.js` i18n core;
- `en`, `zh`, `hi`, `ru` dictionaries;
- header language switcher और "System default" option;
- `t()`-based SPA shell, views, tutorial, settings और connection guides;
- `js/tests/i18n.test.js` parity/detection/persistence tests;
- root `README`, `CHANGELOG`, `mobile/README`, top-level docs और issue-18
  case study के four-language Markdown siblings;
- `js/tests/docs-language.test.js` for hive-mind-style language switchers।
