# Components and prior art consulted

This document records every existing component / library / standard
that informed the i18n solution shipped in PR #19.

## Internal precedent

### `useTheme()` in `js/src/web/app.js`

The theme toggle is the model the language switcher mirrors. The
relevant patterns reused verbatim in `js/src/web/i18n.js`:

- `localStorage` key (`metaSovereignTheme`) with the same null-safe
  guards (`try`/`catch` around `getItem`/`setItem` because storage is
  disabled in some restricted browser contexts).
- `useState` initialiser that runs detection only when no override
  is saved.
- `useEffect` that applies the preference to
  `document.documentElement` (the theme uses `dataset.theme`, the
  locale uses `lang` and `dir`).
- A toggle / setter that updates state and persists in one call.

### `useTutorialPreference()` in `js/src/web/tutorial.js`

Issue #10's tutorial overlay shipped a tiny in-house module rather
than pulling in `intro.js` / `shepherd.js`. PR #19 follows the same
playbook for i18n: a ~120-line module beats a 14KB+ dependency for
a four-locale catalogue with no ICU formatting requirements.

### `availableLocales` shape mirrors `defaultSteps`

`defaultSteps` in `tutorial.js` is an array of `{ id, title, body }`
objects rendered by a tiny stateful helper. `availableLocales`
in `i18n.js` is an array of `{ id, label, dir }` objects rendered by
a `LanguageSwitcher` `<select>`.

## External standards

### BCP-47 / RFC 5646

The IETF "Tags for Identifying Languages" standard. PR #19 stores
locale ids as the **shortest unambiguous BCP-47 tag** for each
language: `en`, `zh` (covers `zh-Hans-CN` and `zh-Hant-TW` for
this PR's strings), `hi`, `ru`. The matcher uses primary subtag
prefix matching so `zh-Hans-CN`, `zh-CN`, `zh-Hant`, and `zh` all
resolve to the same dictionary.

### ISO 639-1 vs. the issue's `ch`

The issue uses `ch` for Chinese, which is _not_ an ISO 639-1 code
(`ch` is unassigned; `zh` is the standard code for Chinese). PR #19
uses `zh` everywhere in code and storage, but the case study notes
the discrepancy in `README.md` §1 so future readers don't see a
mismatch and assume a typo.

### `navigator.languages` and `navigator.language`

The W3C HTML Living Standard documents both APIs. `navigator.languages`
is the ordered list of preferred locales (highest priority first),
and `navigator.language` is the single best preference (a fallback
for browsers that don't implement the array, though all four major
engines have shipped it since 2015).

### Language tag fallback (RFC 4647 §3.4 "Lookup")

The matcher in `i18n.js` follows RFC 4647 §3.4 "Lookup": for each
candidate (in order), strip subtags right-to-left until a match is
found or the candidate is exhausted, then move to the next candidate.

## Libraries surveyed and rejected

### `i18next` + `react-i18next`

- **License:** MIT (compatible with Unlicense).
- **Bundle size:** ~14KB min+gz for `i18next` core, ~3KB for
  `react-i18next`, plus optional `i18next-browser-languagedetector`
  (~2KB) and `i18next-http-backend` (~3KB).
- **Why rejected:** Far more surface area than needed for four
  static dictionaries. The "backend" loaders push translations to
  the network at runtime, which conflicts with the offline-first
  contract. The CLDR-driven plural rules (`Intl.PluralRules`) are
  unnecessary for the SPA's current set of strings, none of which
  carry counts.

### `react-intl` (FormatJS)

- **License:** BSD-3 (compatible with Unlicense).
- **Bundle size:** ~30KB min+gz for `react-intl`, plus the
  `@formatjs/intl-*` polyfills as needed.
- **Why rejected:** ICU MessageFormat is overkill for our string
  set. The killer feature — locale-aware plurals, gender, and
  date/number formatting — is unused; we'd ship 30KB to gain a
  call site that says `<FormattedMessage id="…" />` instead of
  `t('…')`.

### `lingui`

- **License:** MIT.
- **Bundle size:** ~3KB runtime min+gz, but requires a build-time
  CLI step (`@lingui/cli`) that scans the source for tagged
  template literals and emits compiled message catalogues.
- **Why rejected:** The build-time CLI would have to be added to
  `js/scripts/build-web.mjs`, and the `i18n.js` module would have
  to expose a `<Trans>` component. The win is small for four
  static dictionaries.

### `polyglot.js` (Airbnb)

- **License:** BSD-2.
- **Bundle size:** ~7KB min+gz.
- **Why rejected:** Closest to the in-house module in shape, but
  hasn't seen a release since 2022 and pulls in `lodash` shims for
  string interpolation. The 60-line in-house module covers our
  feature set without the dependency tree.

### `vite-plugin-i18n`, `next-i18next`, etc.

- **Why rejected:** The repo doesn't use Vite or Next; the SPA is
  built by a hand-written `esbuild` script. Framework-specific
  plugins do not apply.

## Conclusion

The repo's existing patterns (`useTheme`, the in-house tutorial
overlay, the hand-written esbuild bundler) point at a small,
hand-rolled module rather than a third-party i18n library.
`js/src/web/i18n.js` ships the `t()` lookup, the `useLocale()`
hook, and the four dictionaries in ~120 lines of code, plus
~250 lines of translated strings spread across four dictionary
files. Total bundle impact is under 8KB after esbuild minification.

If the surface ever outgrows simple key→string lookup (e.g. the SPA
needs ICU-style plurals, gender, or relative-time formatting), the
migration path is straightforward: the public surface (`t()`,
`useLocale()`, dictionary shape) is intentionally a strict subset
of `i18next`'s surface, so a one-day refactor swaps the in-house
module for `i18next` without touching call sites.
