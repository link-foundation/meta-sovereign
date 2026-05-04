# Case Study: Issue #18 — Support i18n of UI for en, zh, hi, ru (languages: en • [zh](README.zh.md) • [hi](README.hi.md) • [ru](README.ru.md))

**Issue:** [#18 — Support i18n of UI for en (english), ch (chinese), hi (hindi), and ru (russian)](https://github.com/link-foundation/meta-sovereign/issues/18)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-18-511583e63fad`
**Pull Request:** [#19](https://github.com/link-foundation/meta-sovereign/pull/19)

This case study collects every directive from issue #18, decomposes it
into atomic requirements (`R-I*`), records the prior art and tooling
surveyed, and lays out the solution plan that PR #19 implements
against the existing local-first / privacy-first design constraints
already established in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md).

The artefacts in this folder are:

| File                   | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `README.md`            | This document — case study analysis.                                                                  |
| `requirements.md`      | Atomic requirement list (`R-I*`) extracted from the issue.                                            |
| `solution-plan.md`     | Phased plan mapping requirements to concrete deliverables in PR #19.                                  |
| `components.md`        | Catalogue of upstream tooling and standards consulted.                                                |
| `external-research.md` | Summary of external research about browser language detection, BCP-47 tags, and i18n library choices. |
| `data/`                | Raw artefacts (issue body, comments) used to build this study.                                        |

---

## 1. Vision (paraphrased from the issue)

The SPA already supports a theme toggle (issue #10 added a `Theme`
button, persisted under `metaSovereignTheme` in `localStorage`). The
reporter asks for a parallel **language switcher** so users can choose
between English, Chinese, Hindi, and Russian, with **automatic
detection** based on browser data on first visit. The directive is to
treat the language exactly the way the theme is treated: detect the
default once, persist the user's override, and apply it across the
entire SPA.

The list of locales (in the issue's spelling vs. the canonical BCP-47
codes) is:

| Issue label | BCP-47 code | English name |
| ----------- | ----------- | ------------ |
| `en`        | `en`        | English      |
| `ch`        | `zh`        | Chinese      |
| `hi`        | `hi`        | Hindi        |
| `ru`        | `ru`        | Russian      |

The issue uses `ch` informally — the canonical ISO 639-1 / BCP-47 code
for Chinese is `zh` (with `zh-CN` or `zh-Hans` for Simplified
Chinese). PR #19 ships translations under `zh` (Simplified, `zh-Hans`)
because that is what every modern browser, OS, and `Intl.*` API
returns for the Chinese reporter's `navigator.language`.

## 2. Why this case study exists

The issue explicitly requests:

> _We need to collect data related about the issue to this repository,
> make sure we compile that data to `./docs/case-studies/issue-{id}`
> folder, and use it to do deep case study analysis (also make sure to
> search online for additional facts and data), list of each and all
> requirements from the issue, and propose possible solutions and
> solution plans for each requirement (we should also check known
> existing components/libraries, that solve similar problem or can
> help in solutions)._

This document is the central deliverable of that request.

## 3. Method

1. **Source extraction** — the issue body is captured via `gh` to
   `data/issue-18.json` so the case study is self-contained. There
   were no comments at the time of capture, so
   `data/issue-18-comments.json` is an empty list.
2. **Requirement decomposition** — see `requirements.md`. Each item
   carries a stable `R-I*` identifier so changesets, PRs, and code
   comments can reference it.
3. **External research** — see `external-research.md`. The browser
   language-detection API surface (`navigator.language`,
   `navigator.languages`), BCP-47 fallback rules, the
   `Intl.Locale` / `Intl.LocaleMatcher` polyfills, and the licensing
   posture of major i18n libraries (`i18next`, `react-i18next`,
   `react-intl`, `formatjs`, `lingui`, `polyglot.js`) were surveyed
   before deciding to ship a tiny in-house dictionary loader.
4. **Component survey** — see `components.md`. The existing
   `useTheme()` hook in `js/src/web/app.js` is the immediate model:
   it persists the override under a `localStorage` key, falls back to
   a system preference (`prefers-color-scheme`), and applies the
   value via a single `useEffect`. The new `useLocale()` hook follows
   the same shape (`metaSovereignLocale` key, `navigator.language*`
   fallback, applied via `document.documentElement.lang` +
   `dir="rtl|ltr"`).
5. **Solution plan** — see `solution-plan.md`. Each `R-I*` row maps
   to one or more concrete deliverables in PR #19, with the order of
   landing chosen so the PR is reviewable in slices.

## 4. Why a tiny in-house module instead of `i18next` / `react-intl`

The repo's existing constraints rule out the heavyweight i18n stacks:

- **Local-first / build-time offline.** No new npm dependency is
  acceptable that pulls a CLDR snapshot at install time or wires a
  loader to fetch translations from a CDN. Issue #16 made this
  constraint explicit: "No new external dependency that requires
  network at build time. New runtime dependencies must be vendored or
  pure-JS." `i18next` (and especially `formatjs`) routinely pull
  ~1MB+ of CLDR data, which would dwarf the existing 60KB SPA bundle.
- **License compatibility.** The repo ships under the Unlicense.
  `i18next` is MIT, `react-intl` is BSD-3, both compatible — but
  shipping them would add MIT/BSD copyright headers to the SPA
  bundle that is currently 100% Unlicensed code authored in this
  repo. The tutorial overlay (issue #10) made the same trade-off and
  shipped a ~150-line in-house overlay; we follow that precedent.
- **Bundle size.** `i18next` adds ~14KB minified + gzipped before
  the formatter / detector plugins. The SPA's `app.min.js` is
  currently ~270KB (mostly React + project code); adding 30KB+
  exclusively for translation lookups is hard to justify when a
  60-line module covers all four target locales.
- **Surface area.** The SPA has a small, mostly static set of
  user-facing strings: navigation labels, button text, headings,
  placeholders, and a handful of long-form connection-guide hints.
  ICU MessageFormat (the killer feature of `react-intl`) is overkill
  for this scope; simple key-to-string lookup suffices.

PR #19 instead ships `js/src/web/i18n.js`: a ~120-line module that
exports `t(key)`, `useLocale()`, `setLocale()`, plus four
JSON-shaped dictionaries (`en`, `zh`, `hi`, `ru`). The shape is
intentionally a strict subset of `i18next` / `formatjs` (string keys,
`{var}` placeholders) so the migration path to a heavier library is
a one-day refactor if the surface ever outgrows this implementation.

## 5. Constraints we are honouring

- **Privacy-first.** The locale preference is stored in
  `localStorage` only, never broadcast to peers. The same approach
  the theme toggle takes.
- **Offline-first.** All four dictionaries ship in the `app.min.js`
  bundle so locale switches never trigger a network request.
- **Accessibility.** The `<html lang>` attribute is updated when the
  locale changes (essential for screen readers and CJK text
  rendering). The `dir` attribute is updated to `rtl` or `ltr` on
  every change, even though none of the four target locales are
  RTL — this prepares the surface for a future Arabic/Hebrew/Persian
  addition without another refactor.
- **Browser-first auto-detect.** `navigator.languages` (then
  `navigator.language`) is consulted on first visit, mapped to the
  closest supported locale via a tiny BCP-47 prefix matcher. The
  override, once chosen, wins forever (until the user clears
  localStorage or picks "System default").
- **One PR, until done.** All changes land in PR #19; nothing is
  split off.

## 6. Outcome (executive summary)

PR #19 ships:

- a new **i18n core** (`js/src/web/i18n.js`) with `t(key, vars)`,
  `useLocale()`, `setLocale()`, `availableLocales`, automatic
  `<html lang|dir>` updates, browser-language detection, and
  `localStorage` persistence;
- four **locale dictionaries** (`en.js`, `zh.js`, `hi.js`, `ru.js`)
  covering every user-facing string in the SPA shell — navigation,
  theme/language toggles, status badges, tutorial copy, view
  headings, common actions;
- a **language switcher** dropdown in the header alongside the
  existing theme toggle, with translated labels and an explicit
  "System default" option that clears the override;
- updated **SPA components** (`app.js`, `views.js`, `tutorial.js`,
  `connection-guide.js`, `settings-view.js`) using `t()` instead of
  hardcoded English;
- a **unit-test layer** for the i18n module (detection, persistence,
  fallback, placeholder substitution, `<html>` attribute updates),
  plus a parity test that asserts every locale dictionary exposes
  the same keys as `en`;
- translated **Markdown documentation** for root `README`,
  `CHANGELOG`, `mobile/README`, top-level `docs/*.md`, and this
  issue-18 case study, with hive-mind-style language switchers on
  every tracked H1;
- the case study artefacts in this folder, also available in `zh`,
  `hi`, and `ru`.

The mapping from issue text → `R-I*` → deliverable lives in
[`solution-plan.md`](./solution-plan.md).
