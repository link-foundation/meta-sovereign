# 查询过的组件和 prior art (languages: [en](components.md) • zh • [hi](components.hi.md) • [ru](components.ru.md))

本文件记录影响 PR #19 i18n 方案的内部 precedent、外部标准和候选库。

## Internal precedent

### `useTheme()` in `js/src/web/app.js`

Theme toggle 是 language switcher 的直接模型：

- 使用 `localStorage` key，并用 `try`/`catch` 防御受限浏览器环境。
- `useState` initializer 只在没有 override 时运行 detection。
- `useEffect` 把 preference 应用到 `document.documentElement`。
- Setter 在一次调用中更新 state 和 persistence。

### `useTutorialPreference()` in `js/src/web/tutorial.js`

Issue #10 的 tutorial overlay 选择了小型 in-house module，而不是引入
`intro.js` / `shepherd.js`。PR #19 对 i18n 采用同样策略：四个静态 locale 不
需要 14KB+ dependency。

### `availableLocales`

`availableLocales` 使用 `{ id, label, dir }` 数组驱动 `<LanguageSwitcher />`，
结构类似 tutorial 的 `defaultSteps`。

## External standards

- **BCP-47 / RFC 5646:** locale ids 使用最短不歧义 tag：`en`、`zh`、`hi`、
  `ru`。
- **ISO 639-1:** issue 的 `ch` 不是 Chinese 的标准 code；PR 使用 `zh`。
- **`navigator.languages` / `navigator.language`:** 按用户偏好顺序提供浏览
  器语言数据。
- **RFC 4647 lookup:** matcher 对每个 candidate 右侧逐级剥离 subtag，直到
  匹配 supported locale。

## Libraries surveyed

| Library                     | License | Decision                                                                                           |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `i18next` + `react-i18next` | MIT     | 功能丰富但对四个静态 dictionaries 过重；runtime/backend loaders 与 offline-first contract 不匹配。 |
| `react-intl` / FormatJS     | BSD-3   | ICU MessageFormat 强大，但当前 strings 没有 plural/gender/date requirements。                      |
| `lingui`                    | MIT     | Runtime 小，但需要 build-time CLI 和 `<Trans>` component。                                         |
| `polyglot.js`               | BSD-2   | 形状接近，但维护较少且引入 interpolation dependency。                                              |
| Vite/Next plugins           | varies  | Repo 不使用 Vite/Next，framework-specific plugins 不适用。                                         |

## Conclusion

Repo 已有模式（`useTheme`、in-house tutorial overlay、hand-written esbuild
bundler）都指向小型 hand-rolled module。`js/src/web/i18n.js` 提供 `t()`、
`useLocale()` 和四个 dictionaries；如果未来需要 ICU plurals 或 relative-time，
公共 surface 可以迁移到更重的库。
