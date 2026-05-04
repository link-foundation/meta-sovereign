# Solution plan for issue #18 (languages: en • [zh](solution-plan.zh.md) • [hi](solution-plan.hi.md) • [ru](solution-plan.ru.md))

This document maps every `R-I*` requirement to a concrete deliverable
in PR #19. The plan is organised in landing order so the PR is
reviewable in slices.

## Phase 1 — i18n core module

**Deliverable:** `js/src/web/i18n.js`.

| Export                 | Purpose                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `LOCALE_STORAGE_KEY`   | The `localStorage` key (`metaSovereignLocale`). Exported so tests don't repeat the literal.            |
| `availableLocales`     | `[{ id, label, dir }, …]` — drives the switcher and the fallback table.                                |
| `defaultLocale`        | `'en'`. Final fallback when detection misses.                                                          |
| `dictionaries`         | `{ en, zh, hi, ru }` — JSON-shaped translation tables.                                                 |
| `t(key, vars, locale)` | Pure translation lookup. Substitutes `{var}` placeholders. Falls back to `en` then to the literal key. |
| `detectInitialLocale`  | Reads `localStorage` first, then `navigator.languages`, returns the matched locale id or `'en'`.       |
| `applyLocale(id)`      | Sets `document.documentElement.lang` and `dir`.                                                        |
| `useLocale()`          | React hook returning `{ locale, setLocale, clearLocale, t, available }`.                               |

**Requirements covered:** R-I1, R-I2, R-I3, R-I4, R-I5, R-I7.

## Phase 2 — Locale dictionaries

**Deliverable:** four JS modules — `js/src/web/locales/en.js`,
`zh.js`, `hi.js`, `ru.js` — re-exported by `js/src/web/locales/index.js`.

The keys are namespaced by view to keep them findable:

```
nav.chat, nav.contacts, nav.settings, …
header.theme, header.tutorial, header.language, header.languageHint,
header.systemDefault, header.online, header.offline, …
chat.title, chat.placeholder, chat.send, chat.empty, …
operator.title, operator.next, operator.done, operator.empty, …
contacts.title, contacts.heading.identity, …
settings.title, settings.intro, …
tutorial.welcome.title, tutorial.welcome.body, …
backup.title, …
common.loading, common.refresh, common.save, common.cancel, …
```

A parity test (Phase 4) ensures each non-English dictionary exposes
exactly the same keys.

**Requirements covered:** R-I3, R-I6.

## Phase 3 — Wire the SPA shell to `t()`

**Deliverable:** edits to `js/src/web/app.js`,
`js/src/web/views.js`, `js/src/web/tutorial.js`,
`js/src/web/connection-guide.js`, `js/src/web/settings-view.js`,
`js/src/web/nav-items.js`, and `js/src/web/index.html`.

Highlights:

- `app.js` mounts the `useLocale()` hook next to `useTheme()`. The
  header gets a `<select>` populated from `availableLocales` plus a
  "System default" option that calls `clearLocale()`. The nav
  buttons map their visible label through `t()`.
- `nav-items.js` becomes `[id, translationKey]` pairs (e.g.
  `['chat', 'nav.chat']`), and view rendering looks the label up at
  render time so the visible text updates instantly when the locale
  changes.
- `views.js` replaces every hardcoded English literal that the user
  can see. Long-form copy ("Operators: AND, OR, NOT, parens. …") is
  moved into the dictionary too; we keep API tokens, JSON snippets,
  and provider IDs as-is.
- `tutorial.js` swaps its `defaultSteps` source: the steps now carry
  translation keys instead of literal strings, and a tiny
  `localiseSteps()` helper renders them at view time. Storage shape
  is unchanged, so the existing tutorial tests keep passing.
- `connection-guide.js` swaps the static "You must connect a
  provider first…" copy and the "Open Settings → Connections" CTA
  for translated keys.
- `settings-view.js` localises the page header, intro paragraph,
  and the "Save credentials" / "Forget" / "Try directly" /
  "Import pasted contents" labels. Provider labels and API URLs
  remain in their source form.
- `index.html` adds a `<meta name="application-name">` and a
  `<title>` that gets updated on every locale change so the
  browser tab title matches the active language too.

**Requirements covered:** R-I1, R-I6, R-I7.

## Phase 4 — Tests

**Deliverable:** `js/tests/i18n.test.js` and updates to
`js/tests/web-react.test.js` (parity assertion + bundle-size sanity
check).

Test cases:

1. `detectInitialLocale()` returns the localStorage value when set,
   regardless of `navigator.languages`.
2. `detectInitialLocale()` matches `navigator.languages` prefixes
   (e.g. `ru-RU` → `ru`, `zh-Hans-CN` → `zh`).
3. `detectInitialLocale()` falls back to `'en'` for unsupported
   locales (`fr-FR` → `en`).
4. `t(key)` returns the English string when the active locale is
   `en`.
5. `t(key)` returns the translated string when the active locale
   is `ru`.
6. `t(key, { name: 'world' })` substitutes `{name}` placeholders.
7. `t('does.not.exist')` falls back to the key string and does not
   throw.
8. `setLocale('zh')` writes `metaSovereignLocale=zh` to storage and
   sets `document.documentElement.lang === 'zh'`.
9. `clearLocale()` removes the storage entry and re-runs detection.
10. **Parity assertion** — every non-English dictionary exports the
    same set of keys as `en`.
11. **Switcher rendering** — `LanguageSwitcher` renders five
    options (English, Chinese, Hindi, Russian, System default).

**Requirements covered:** R-I8.

## Phase 5 — Build, lint, format, ship

- `npm run lint` — no new warnings.
- `npm run format` — the new files are prettier-clean.
- `npm test` — all existing + new tests pass.
- `npm run build:web` — the bundle rebuilds and grows by less than
  the size of the four dictionaries (~5KB minified, mostly
  Devanagari + CJK characters).
- The PR description is rewritten to summarise the case study,
  link the requirements, and embed a screenshot of the switcher.

**Requirements covered:** R-I9, R-I10.

## Phase 6 — Markdown documentation localisation

**Deliverable:** language-switcher H1s plus `.zh.md`, `.hi.md`, and
`.ru.md` siblings for root `README`, `CHANGELOG`, `mobile/README`,
top-level `docs/*.md`, and this issue-18 case-study folder.

The implementation follows the hive-mind convention:

```markdown
# Title (languages: en • [zh](FILE.zh.md) • [hi](FILE.hi.md) • [ru](FILE.ru.md))
```

Localized siblings keep the active locale unlinked and link the other
three. `js/tests/docs-language.test.js` walks the tracked
user-facing Markdown groups, verifies that all siblings exist, and
checks that every switcher link resolves inside the same directory.

**Requirements covered:** R-I11, R-I12.

## Out of scope (not in this PR)

- Right-to-left layout. The `dir` attribute already updates so RTL
  languages can be added later without another refactor, but no
  RTL-specific CSS is added in this PR.
- Native-speaker review of every translation. The strings are
  produced from the developer's best knowledge and well-known
  reference dictionaries; a follow-up issue can collect feedback
  from native speakers.
- Date / number / currency formatting. Out of scope — the SPA
  currently uses `toLocaleString()` which already respects
  `<html lang>`. ICU MessageFormat is intentionally avoided (see
  README §4).
- Server-side translation. The `js/src/server/` HTTP API is
  English-only; the localisation contract is browser-side only.
