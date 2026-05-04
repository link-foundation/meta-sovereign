# 案例研究：Issue #18 — 支持 en、zh、hi、ru 的 UI i18n (languages: [en](README.md) • zh • [hi](README.hi.md) • [ru](README.ru.md))

**Issue:** [#18 — Support i18n of UI for en, ch, hi, and ru](https://github.com/link-foundation/meta-sovereign/issues/18)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-18-511583e63fad`
**Pull Request:** [#19](https://github.com/link-foundation/meta-sovereign/pull/19)

本案例研究收集 issue #18 和 PR #19 后续评论中的每条指令，将它们拆分为
`R-I*` 原子需求，记录外部研究、组件/标准调研，并说明 PR #19 如何在既有的
local-first / privacy-first 约束下实现。

## Artefacts

| File                   | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `README.md`            | 案例研究主文档。                          |
| `requirements.md`      | 从 issue 和 PR 评论提取的原子需求。       |
| `solution-plan.md`     | 将需求映射到 PR #19 deliverables 的计划。 |
| `components.md`        | 查询过的上游工具、标准和现有实现。        |
| `external-research.md` | 浏览器语言检测、BCP-47 和 i18n 方案研究。 |
| `data/`                | 用于研究的原始 issue/comment artefacts。  |

## 1. Vision

SPA 已经有 theme toggle，并把选择持久化到
`localStorage.metaSovereignTheme`。issue 要求以同样方式提供 language
switcher：第一次访问时用浏览器/应用数据自动检测语言，之后允许用户在 English、
Chinese、Hindi、Russian 之间切换并持久化。

Issue 使用 `ch` 表示 Chinese，但现代浏览器和 BCP-47/ISO 639-1 使用 `zh`。
PR #19 因此使用 `zh`（Simplified Chinese / `zh-Hans`）作为代码、storage 和
文档文件名中的 canonical code。

## 2. Method

1. 使用 `gh` 捕获 issue 数据到 `data/issue-18.json`。
2. 在 `requirements.md` 中拆解 `R-I1..R-I12`。
3. 在 `external-research.md` 中记录 `navigator.languages`、BCP-47 lookup、
   `<html lang>`、plural rules 和候选 i18n libraries。
4. 在 `components.md` 中比较内部 precedent（`useTheme()`、tutorial overlay）
   与外部库（`i18next`、`react-intl`、`lingui`、`polyglot.js`）。
5. 在 `solution-plan.md` 中把需求映射到 i18n module、dictionaries、SPA wiring、
   tests 和 docs localisation。

## 3. Why an in-house module

`i18next`、`react-intl` 等库兼容 license，但对当前小型静态 SPA 来说体积和
复杂度过高。PR #19 选择 `js/src/web/i18n.js`：小型纯 JS module，提供
`t(key, vars)`、`useLocale()`、`setLocale()`、browser detection、localStorage
persistence、`<html lang|dir>` 更新，以及四个 bundled dictionaries。这个接口
是 `i18next`/FormatJS 能力的严格子集，未来需要 ICU plural/gender/date
formatting 时可以迁移。

## 4. Constraints

- Privacy-first：locale preference 只存在 `localStorage`，不向 peer sync。
- Offline-first：四个 dictionaries 随 bundle 一起发布，切换语言不发网络请求。
- Accessibility：每次切换都更新 `<html lang>` 和 `dir`。
- Browser-first detection：`navigator.languages` → `navigator.language` →
  `en` fallback；显式 override 优先。
- Single PR：所有工作都在 PR #19 中完成。

## 5. Outcome

PR #19 提供：

- `js/src/web/i18n.js` i18n core；
- `en`、`zh`、`hi`、`ru` dictionaries；
- header 中的 language switcher 和 "System default" 选项；
- 使用 `t()` 的 SPA shell、views、tutorial、settings 和 connection guides；
- `js/tests/i18n.test.js` dictionary parity 与 detection/persistence tests；
- root `README`、`CHANGELOG`、`mobile/README`、top-level docs 和 issue-18 case
  study 的四语言 Markdown sibling files；
- `js/tests/docs-language.test.js`，确保 tracked docs 都有 hive-mind-style
  language switcher。
