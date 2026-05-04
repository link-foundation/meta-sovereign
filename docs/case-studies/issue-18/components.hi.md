# Components और prior art consulted (languages: [en](components.md) • [zh](components.zh.md) • hi • [ru](components.ru.md))

यह file PR #19 i18n solution को inform करने वाले internal precedent,
external standards और candidate libraries record करती है।

## Internal precedent

### `useTheme()` in `js/src/web/app.js`

Theme toggle language switcher का direct model है:

- `localStorage` key और restricted browser contexts के लिए `try`/`catch`।
- `useState` initializer केवल override absent होने पर detection चलाता है।
- `useEffect` preference को `document.documentElement` पर apply करता है।
- Setter state और persistence को एक call में update करता है।

### `useTutorialPreference()` in `js/src/web/tutorial.js`

Issue #10 tutorial overlay ने `intro.js` / `shepherd.js` dependency के बजाय
small in-house module ship किया। PR #19 i18n में वही pattern उपयोग करता है:
four static locales के लिए 14KB+ dependency जरूरत नहीं।

### `availableLocales`

`availableLocales` `{ id, label, dir }` array है जो `<LanguageSwitcher />`
drive करता है, similar to tutorial `defaultSteps`।

## External standards

- **BCP-47 / RFC 5646:** locale ids shortest unambiguous tags हैं: `en`,
  `zh`, `hi`, `ru`।
- **ISO 639-1:** issue का `ch` Chinese का standard code नहीं; PR `zh` use
  करता है।
- **`navigator.languages` / `navigator.language`:** browser preferred
  languages priority order में देता है।
- **RFC 4647 lookup:** matcher candidate subtags right-to-left strip करता
  है जब तक supported locale न मिले।

## Libraries surveyed

| Library                     | License | Decision                                                                                                          |
| --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `i18next` + `react-i18next` | MIT     | Rich लेकिन चार static dictionaries के लिए heavy; runtime/backend loaders offline-first contract से मेल नहीं खाते। |
| `react-intl` / FormatJS     | BSD-3   | ICU MessageFormat powerful, पर current strings plural/gender/date नहीं मांगते।                                    |
| `lingui`                    | MIT     | Runtime छोटा, लेकिन build-time CLI और `<Trans>` component चाहिए।                                                  |
| `polyglot.js`               | BSD-2   | Shape close है, पर maintenance कम और interpolation dependency है।                                                 |
| Vite/Next plugins           | varies  | Repo Vite/Next use नहीं करता, इसलिए plugins apply नहीं।                                                           |

## Conclusion

Existing repo patterns (`useTheme`, in-house tutorial overlay,
hand-written esbuild bundler) small hand-rolled module की ओर इशारा करते
हैं। `js/src/web/i18n.js` `t()`, `useLocale()` और four dictionaries देता
है। Future में ICU plurals या relative-time चाहिए तो public surface heavier
library में migrate हो सकती है।
