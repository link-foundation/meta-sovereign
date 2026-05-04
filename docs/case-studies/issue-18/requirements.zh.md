# 从 issue #18 提取的需求 (languages: [en](requirements.md) • zh • [hi](requirements.hi.md) • [ru](requirements.ru.md))

每一项都带有稳定的 `R-I*` ID，便于 changesets、PR 和代码注释引用。

## R-I1 — 允许用户切换 UI 语言

SPA 必须在 header 中提供和 Theme toggle 同样明显的 language selector。切换应
立即生效、无需刷新，并在 reload 后保持。

Acceptance：header 控件支持 English、Chinese、Hindi、Russian；可见 view 在
一个 React render cycle 内更新；选择写入 `localStorage`。

## R-I2 — 首次访问时用浏览器数据自动检测语言

没有用户 override 时，SPA 根据 `navigator.languages` 和
`navigator.language` 选择最接近的 supported locale，不匹配时 fallback 到
English。

Acceptance：`ru-RU` → `ru`，`hi-IN` → `hi`，`fr-FR` → `en`；只有在没有
`metaSovereignLocale` 时运行 detection。

## R-I3 — 支持 English、Chinese、Hindi、Russian

本 PR 的 locale catalogue 固定为四个。每个 dictionary 必须覆盖 SPA shell
中的 user-facing strings。

Acceptance：`availableLocales` 恰好四项；每个 dictionary 与 `en` 拥有相同
key set。

## R-I4 — 持久化选择的 locale

"App data" 解释为 `localStorage`，和 theme override 使用同一类机制。显式选
择一直优先，直到用户清除或选择 "System default"。

Acceptance：override 存在 `metaSovereignLocale`；system default option 清除
override 并重新检测。

## R-I5 — 每次切换更新 `<html lang>` 和 `<html dir>`

`lang` 支持 screen readers 与 CJK/Devanagari font selection；`dir` 为未来
RTL locale 做准备。

Acceptance：`setLocale('zh')` 后 `document.documentElement.lang === 'zh'`
且 `dir === 'ltr'`。

## R-I6 — 翻译 SPA shell 中所有 authored user-facing strings

Header、nav、status、theme/language/tutorial toggles、tutorial overlay、
connection-guide copy、settings、operator、backup 等 authored strings 必须通
过 `t()`。Provider names 和 API identifiers 保持原文。

## R-I7 — Locale switching 不破坏 theme toggle

Language switcher 复用 theme toggle 的模式，并且两个控件能在 narrow viewport
中共存。

## R-I8 — Tests 覆盖 detection、persistence、fallback 和 dictionary parity

Acceptance：`detectInitialLocale()`、`setLocale()`、`clearLocale()`、`t()`、
fallback、`<html>` attributes、dictionary parity 和 switcher options 都有
测试。

## R-I9 — 单个 PR 完成所有需求

所有 `R-I*` 都必须在 PR #19 中完成，分支为 `issue-18-511583e63fad`。

## R-I10 — 在 case study 中记录 i18n surface

`docs/case-studies/issue-18/` 必须包含 `README.md`、`requirements.md`、
`solution-plan.md`、`components.md`、`external-research.md` 和 raw issue data。

## R-I11 — 同四种语言翻译 user-facing Markdown docs

Root `README`、`CHANGELOG`、`mobile/README`、top-level `docs/*.md` 和本 PR
新增的 issue-18 case-study docs 都需要 `.zh.md`、`.hi.md`、`.ru.md` siblings。
历史 case-study evidence files 仍作为 archival source material，除非未来 issue
明确要求全部本地化。

## R-I12 — Markdown 文档加入 language switcher

每个 tracked Markdown H1 必须遵循 hive-mind 风格：`(languages: ...)`，当前
locale 为 plain text，其他 locale 链接到 sibling file。`js/tests/docs-language.test.js`
验证 sibling presence 和链接是否 resolve。
