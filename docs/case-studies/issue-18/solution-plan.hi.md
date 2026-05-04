# Issue #18 solution plan (languages: [en](solution-plan.md) • [zh](solution-plan.zh.md) • hi • [ru](solution-plan.ru.md))

यह plan हर `R-I*` requirement को PR #19 deliverables से map करता है और
landing order में organized है।

## Phase 1 — i18n core module

**Deliverable:** `js/src/web/i18n.js`.

Exports: `LOCALE_STORAGE_KEY`, `availableLocales`, `defaultLocale`,
`dictionaries`, `t(key, vars, locale)`, `detectInitialLocale()`,
`applyLocale(id)`, `useLocale()`।

Covered requirements: R-I1, R-I2, R-I3, R-I4, R-I5, R-I7।

## Phase 2 — Locale dictionaries

**Deliverable:** `js/src/web/locales/en.js`, `zh.js`, `hi.js`, `ru.js` और
`index.js` re-export।

Keys view namespace में हैं: `nav.*`, `header.*`, `chat.*`, `operator.*`,
`settings.*`, `tutorial.*`, `backup.*`, `common.*`। Parity test हर
non-English dictionary को `en` key set से match करता है।

Covered requirements: R-I3, R-I6।

## Phase 3 — Wire SPA shell to `t()`

**Deliverable:** `app.js`, `views.js`, `tutorial.js`,
`connection-guide.js`, `settings-view.js`, `nav-items.js`, `index.html`
updates।

Highlights:

- Header में `useLocale()` `useTheme()` के पास mount होता है।
- Nav items literal labels से translation keys बनते हैं।
- Views की authored English UI copy dictionaries में जाती है।
- Tutorial steps translation keys रखते हैं; storage shape unchanged।
- Connection guide और Settings active locale से render होते हैं।
- Browser tab title active language follow करता है।

Covered requirements: R-I1, R-I6, R-I7।

## Phase 4 — Tests

**Deliverable:** `js/tests/i18n.test.js`।

Tests localStorage override, browser-language prefix matching, fallback,
translation lookup, placeholder substitution, missing-key fallback,
`<html lang|dir>` updates, dictionary parity और switcher options cover
करते हैं।

Covered requirements: R-I8।

## Phase 5 — Build, lint, format, ship

Run: `npm run lint`, `npm run format` / `npm run format:check`, `npm test`,
`npm run build:web`। PR description case study, requirements और test
results summarize करता है।

Covered requirements: R-I9, R-I10।

## Phase 6 — Markdown documentation localisation

**Deliverable:** root `README`, `CHANGELOG`, `mobile/README`, top-level
`docs/*.md` और issue-18 case-study docs के H1 language switchers plus
`.zh.md`, `.hi.md`, `.ru.md` siblings।

Convention:

```markdown
# Title (languages: en • [zh](FILE.zh.md) • [hi](FILE.hi.md) • [ru](FILE.ru.md))
```

Localized siblings current locale को plain text रखते हैं और बाकी तीन files
link करते हैं। `js/tests/docs-language.test.js` tracked docs sibling
presence और link resolution verify करता है।

Covered requirements: R-I11, R-I12।

## Out of scope

RTL-specific CSS, native-speaker review, date/number/currency formatting
और server-side translation इस PR में out of scope हैं।
