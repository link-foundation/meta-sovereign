# Components and prior art consulted (languages: [en](components.md) • [zh](components.zh.md) • [hi](components.hi.md) • ru)

Файл фиксирует internal precedent, external standards и candidate
libraries, которые повлияли на i18n solution in PR #19.

## Internal precedent

### `useTheme()` in `js/src/web/app.js`

Theme toggle - direct model для language switcher:

- `localStorage` key и `try`/`catch` для restricted browser contexts.
- `useState` initializer запускает detection only when override absent.
- `useEffect` applies preference to `document.documentElement`.
- Setter updates state and persistence in one call.

### `useTutorialPreference()` in `js/src/web/tutorial.js`

Tutorial overlay from issue #10 shipped small in-house module instead of
`intro.js` / `shepherd.js`. PR #19 follows the same pattern for i18n:
four static locales do not need 14KB+ dependency.

### `availableLocales`

`availableLocales` is `{ id, label, dir }` array that drives
`<LanguageSwitcher />`, similar to tutorial `defaultSteps`.

## External standards

- **BCP-47 / RFC 5646:** locale ids use shortest unambiguous tags: `en`,
  `zh`, `hi`, `ru`.
- **ISO 639-1:** issue's `ch` is not standard Chinese code; PR uses `zh`.
- **`navigator.languages` / `navigator.language`:** browser exposes
  preferred languages in priority order.
- **RFC 4647 lookup:** matcher strips candidate subtags right-to-left
  until supported locale matches.

## Libraries surveyed

| Library                     | License | Decision                                                                                                   |
| --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `i18next` + `react-i18next` | MIT     | Rich but heavy for four static dictionaries; runtime/backend loaders conflict with offline-first contract. |
| `react-intl` / FormatJS     | BSD-3   | ICU MessageFormat is powerful, but current strings do not need plural/gender/date support.                 |
| `lingui`                    | MIT     | Small runtime, but requires build-time CLI and `<Trans>` component.                                        |
| `polyglot.js`               | BSD-2   | Close shape, but lower maintenance and interpolation dependency.                                           |
| Vite/Next plugins           | varies  | Repo does not use Vite/Next, so plugins do not apply.                                                      |

## Conclusion

Existing repo patterns (`useTheme`, in-house tutorial overlay,
hand-written esbuild bundler) point to small hand-rolled module.
`js/src/web/i18n.js` provides `t()`, `useLocale()` and four dictionaries.
If the surface needs ICU plurals or relative-time later, the public
surface can migrate to a heavier library.
