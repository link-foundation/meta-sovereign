# Requirements extracted from issue #18 (languages: en • [zh](requirements.zh.md) • [hi](requirements.hi.md) • [ru](requirements.ru.md))

Each row carries a stable `R-I*` identifier (the `I` is for
internationalisation) so changesets, PRs, and code comments can
reference the requirement without re-reading the issue.

## R-I1 — Allow the user to switch the UI language

**Source:** _"We need to ensure user can switch not only theme, but also the language"_

The SPA must expose a language selector that is at least as
discoverable as the existing theme toggle in the header. Switching
must take effect immediately, without a page reload, and must persist
across reloads.

**Acceptance:**

- A control in the header (next to `Theme`) lets the user pick
  English, Chinese, Hindi, or Russian.
- Switching updates every translated string in the visible view
  within a single React render cycle.
- The choice is stored in `localStorage` and survives reload.

## R-I2 — Auto-detect the language using browser data on first visit

**Source:** _"we should automatically detect the language using browser data or app data"_

When the user has not set an explicit override, the SPA must pick
the closest supported locale based on `navigator.languages` (and
`navigator.language` as a fallback). When no supported match is
found, English is used.

**Acceptance:**

- A user with `navigator.language === 'ru-RU'` lands on Russian.
- A user with `navigator.languages === ['hi-IN', 'en-US']` lands on
  Hindi.
- A user with `navigator.language === 'fr-FR'` lands on English
  (fallback).
- Detection runs **only** when no `metaSovereignLocale` value is
  saved.

## R-I3 — Support English, Chinese, Hindi, and Russian

**Source:** _"en (english), ch (chinese), hi (hindi), and ru (russian)"_

The catalogue of supported locales is fixed at four for this PR.
Each dictionary must cover every user-facing string in the SPA
shell (header, nav, tutorial, common buttons, headings).

**Acceptance:**

- `availableLocales` exports an array of exactly four entries.
- Every locale dictionary exposes the same set of keys as `en`.
- Each translated string is reviewed for grammatical correctness
  in its language by a fluent speaker (native review out of scope
  for this PR — strings ship with translator notes inline so future
  reviewers can spot context).

## R-I4 — Persist the chosen locale

**Source:** _"we should automatically detect the language using browser data **or app data**"_

"App data" is interpreted here as `localStorage` (the same place the
theme override lives). The user's explicit pick wins forever until
they clear it or pick "System default".

**Acceptance:**

- The override is stored under `metaSovereignLocale`.
- A "System default" option in the switcher clears the override
  and re-runs auto-detection.

## R-I5 — Update `<html lang>` and `<html dir>` on every change

**Source:** Implicit — required for screen readers, CJK font
selection, and future RTL support.

Switching to Chinese must set `<html lang="zh">` so the browser
selects appropriate CJK fonts; switching to Hindi must set `lang="hi"`
so Devanagari rendering is announced correctly to screen readers.
The `dir` attribute is updated even though all four locales are LTR
(future-proofing for Arabic/Hebrew/Persian).

**Acceptance:**

- After `setLocale('zh')`, `document.documentElement.lang === 'zh'`.
- After `setLocale('zh')`, `document.documentElement.dir === 'ltr'`.

## R-I6 — Translate every user-facing string in the SPA shell

**Source:** Implicit — without this the language switcher is a no-op.

The SPA shell — header brand, nav buttons, status badge,
theme/language/tutorial toggles, the tutorial overlay, the empty-state
"Connection guide" copy, the Settings page header, the Operator
queue, the Backup view, etc. — must use `t()` instead of hardcoded
English. Strings that are pure data (chat messages, contact ids,
provider docs URLs) stay in their source language.

**Acceptance:**

- Switching to Chinese leaves no English label in any nav button,
  header text, button label, or empty-state copy that was authored
  in this repo.
- Provider names ("Telegram", "WhatsApp Cloud", "Facebook Graph")
  stay in English because they are proper nouns / API brand names.

## R-I7 — Locale switching does not break the existing theme toggle

**Source:** Implicit — regression-prevention.

The theme toggle is the model the language switcher mirrors. Both
must coexist in the header without layout breakage on narrow
viewports.

**Acceptance:**

- Existing theme toggle tests continue to pass.
- The header wraps gracefully on narrow viewports (the existing
  `flex-wrap: wrap` on `.topbar` already handles this).

## R-I8 — Tests cover detection, persistence, fallback, and dictionary parity

**Source:** Implicit — every other PR in this repo ships its own
test layer; see issue #10 (R-M*) and issue #16 (R-O*) for precedent.

**Acceptance:**

- Unit tests for `detectInitialLocale()`, `setLocale()`,
  `clearLocale()`, `t(key, vars)`, fallback to `en`.
- A parity test asserting every dictionary has the same keys as
  `en`.
- A snapshot-style test asserting the language switcher renders
  the four locales plus a "System default" entry.

## R-I9 — Single PR, deliver each requirement fully

**Source:** _"Please plan and execute everything in a single pull request, you have unlimited time and context, … until it is each and every requirement fully addressed"_

**Acceptance:**

- All `R-I*` rows are addressed in PR #19.
- The case study, the i18n module, the translations, the UI
  changes, and the tests all land in `issue-18-511583e63fad`.

## R-I10 — Document the i18n surface in the case study

**Source:** _"compile that data to `./docs/case-studies/issue-{id}` folder"_

**Acceptance:**

- `docs/case-studies/issue-18/` contains `README.md`,
  `requirements.md`, `solution-plan.md`, `components.md`,
  `external-research.md`, and `data/issue-18.json`.

## R-I11 — Translate user-facing Markdown docs into the same four languages

**Source:** PR #19 follow-up comment: _"Also make sure all our docs and README.md file and other user facing .md files are translated in these 4 languages"_

The documentation surface must mirror the UI locale list. The tracked
user-facing Markdown set for this PR is root `README`, `CHANGELOG`,
`mobile/README`, top-level `docs/*.md`, and the issue-18 case-study
documents introduced by this PR. Historical case-study evidence files
remain archival source material unless a future issue explicitly asks
to localise every old research artefact.

**Acceptance:**

- Every tracked English Markdown file has `.zh.md`, `.hi.md`, and
  `.ru.md` siblings in the same directory.
- The localized docs preserve user workflows, command snippets,
  requirement IDs, route names, and traceability links.

## R-I12 — Add language switchers to Markdown documents

**Source:** PR #19 follow-up comment: _"each markdown document has language switcher as in http://github.com/link-assistant/hive-mind"_

Markdown headings must follow the hive-mind convention: the H1 includes
`(languages: ...)`, the current locale appears as plain text, and the
other locales link to sibling files.

**Acceptance:**

- `README.md` starts with `# meta-sovereign (languages: en • [zh](README.zh.md) • [hi](README.hi.md) • [ru](README.ru.md))`.
- Localized siblings make their own locale plain text and link back to
  the other three variants.
- `js/tests/docs-language.test.js` validates sibling presence and
  switcher links.
