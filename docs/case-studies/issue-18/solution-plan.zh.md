# Issue #18 解决方案计划 (languages: [en](solution-plan.md) • zh • [hi](solution-plan.hi.md) • [ru](solution-plan.ru.md))

本计划把每个 `R-I*` requirement 映射到 PR #19 的 deliverable，并按落地顺序组
织，便于 review。

## Phase 1 — i18n core module

**Deliverable:** `js/src/web/i18n.js`.

Exports：`LOCALE_STORAGE_KEY`、`availableLocales`、`defaultLocale`、
`dictionaries`、`t(key, vars, locale)`、`detectInitialLocale()`、
`applyLocale(id)`、`useLocale()`。

Covered requirements：R-I1、R-I2、R-I3、R-I4、R-I5、R-I7。

## Phase 2 — Locale dictionaries

**Deliverable:** `js/src/web/locales/en.js`、`zh.js`、`hi.js`、`ru.js` 以及
`index.js` re-export。

Keys 按 view namespace 组织，例如 `nav.*`、`header.*`、`chat.*`、
`operator.*`、`settings.*`、`tutorial.*`、`backup.*`、`common.*`。Parity test
保证所有非 English dictionaries 与 `en` key set 完全一致。

Covered requirements：R-I3、R-I6。

## Phase 3 — Wire SPA shell to `t()`

**Deliverable:** 更新 `app.js`、`views.js`、`tutorial.js`、
`connection-guide.js`、`settings-view.js`、`nav-items.js` 和 `index.html`。

Highlights：

- Header 中将 `useLocale()` 与 `useTheme()` 并列使用。
- Nav items 从 literal label 变为 translation keys。
- Views 中 authored English UI copy moved into dictionaries。
- Tutorial steps 持有 translation keys，storage shape 不变。
- Connection guide 和 Settings 按 active locale 渲染。
- Browser tab title 跟随 active language。

Covered requirements：R-I1、R-I6、R-I7。

## Phase 4 — Tests

**Deliverable:** `js/tests/i18n.test.js`。

Tests 覆盖 localStorage override、browser-language prefix matching、
fallback、translation lookup、placeholder substitution、missing-key fallback、
`<html lang|dir>` updates、dictionary parity 和 switcher options。

Covered requirements：R-I8。

## Phase 5 — Build, lint, format, ship

Run：`npm run lint`、`npm run format` / `npm run format:check`、`npm test`、
`npm run build:web`。PR 描述总结 case study、requirements 和测试结果。

Covered requirements：R-I9、R-I10。

## Phase 6 — Markdown documentation localisation

**Deliverable:** root `README`、`CHANGELOG`、`mobile/README`、top-level
`docs/*.md` 和 issue-18 case-study docs 的 H1 language switcher 与
`.zh.md`、`.hi.md`、`.ru.md` siblings。

Convention：

```markdown
# Title (languages: en • [zh](FILE.zh.md) • [hi](FILE.hi.md) • [ru](FILE.ru.md))
```

Localized siblings 让当前 locale 为 plain text，并链接其他三个文件。
`js/tests/docs-language.test.js` 验证 tracked docs 的 sibling presence 和 link
resolution。

Covered requirements：R-I11、R-I12。

## Out of scope

RTL-specific CSS、native-speaker review、date/number/currency formatting、
server-side translation 不属于本 PR 范围。
