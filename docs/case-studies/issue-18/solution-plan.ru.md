# Solution plan for issue #18 (languages: [en](solution-plan.md) • [zh](solution-plan.zh.md) • [hi](solution-plan.hi.md) • ru)

Plan maps every `R-I*` requirement to PR #19 deliverables and is organized
in landing order.

## Phase 1 — i18n core module

**Deliverable:** `js/src/web/i18n.js`.

Exports: `LOCALE_STORAGE_KEY`, `availableLocales`, `defaultLocale`,
`dictionaries`, `t(key, vars, locale)`, `detectInitialLocale()`,
`applyLocale(id)`, `useLocale()`.

Covered requirements: R-I1, R-I2, R-I3, R-I4, R-I5, R-I7.

## Phase 2 — Locale dictionaries

**Deliverable:** `js/src/web/locales/en.js`, `zh.js`, `hi.js`, `ru.js` and
`index.js` re-export.

Keys are namespaced by view: `nav.*`, `header.*`, `chat.*`, `operator.*`,
`settings.*`, `tutorial.*`, `backup.*`, `common.*`. Parity test ensures
every non-English dictionary matches the `en` key set.

Covered requirements: R-I3, R-I6.

## Phase 3 — Wire SPA shell to `t()`

**Deliverable:** updates to `app.js`, `views.js`, `tutorial.js`,
`connection-guide.js`, `settings-view.js`, `nav-items.js`, `index.html`.

Highlights:

- Header mounts `useLocale()` next to `useTheme()`.
- Nav items become translation keys instead of literal labels.
- Authored English UI copy in views moves into dictionaries.
- Tutorial steps carry translation keys while storage shape stays unchanged.
- Connection guide and Settings render from active locale.
- Browser tab title follows active language.

Covered requirements: R-I1, R-I6, R-I7.

## Phase 4 — Tests

**Deliverable:** `js/tests/i18n.test.js`.

Tests cover localStorage override, browser-language prefix matching,
fallback, translation lookup, placeholder substitution, missing-key
fallback, `<html lang|dir>` updates, dictionary parity and switcher
options.

Covered requirements: R-I8.

## Phase 5 — Build, lint, format, ship

Run `npm run lint`, `npm run format` / `npm run format:check`, `npm test`
and `npm run build:web`. PR description summarizes case study,
requirements and test results.

Covered requirements: R-I9, R-I10.

## Phase 6 — Markdown documentation localisation

**Deliverable:** H1 language switchers plus `.zh.md`, `.hi.md` and
`.ru.md` siblings for root `README`, `CHANGELOG`, `mobile/README`,
top-level `docs/*.md` and issue-18 case-study docs.

Convention:

```markdown
# Title (languages: en • [zh](FILE.zh.md) • [hi](FILE.hi.md) • [ru](FILE.ru.md))
```

Localized siblings keep current locale as plain text and link the other
three files. `js/tests/docs-language.test.js` verifies tracked docs
sibling presence and link resolution.

Covered requirements: R-I11, R-I12.

## Out of scope

RTL-specific CSS, native-speaker review, date/number/currency formatting
and server-side translation are out of scope for this PR.
