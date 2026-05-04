# Issue #18 外部研究 (languages: [en](external-research.md) • zh • [hi](external-research.hi.md) • [ru](external-research.ru.md))

本文件记录设计 i18n 方案时查询的外部事实和来源。

## 1. Browser language detection

`navigator.languages`（HTML Living Standard）返回用户偏好的 language tags
数组，按优先级降序排列；`navigator.language` 是单个首选 language tag，通常
等于数组第一项。

References:

- https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-languages
- https://html.spec.whatwg.org/multipage/system-state.html#dom-navigator-language

实践结果：`detectInitialLocale()` 先遍历 `navigator.languages`，再 fallback 到
`navigator.language`。

## 2. BCP-47 lookup

RFC 4647 §3.4 描述 "Lookup"：对 language priority list 中的每个 tag，用 prefix
matching 找到最合适的 supported tag。PR #19 的 matcher 简化实现：尝试完整
tag，然后从右侧剥离 subtag，例如 `zh-Hans-CN` → `zh-Hans` → `zh`。

Reference: https://datatracker.ietf.org/doc/html/rfc4647#section-3.4

## 3. Plurals

English、Chinese、Hindi、Russian 的 plural categories 不同，Russian 尤其复杂。
当前 SPA shell 中没有需要语法复数变化的计数字符串；数量通常以括号形式出
现在 label 旁边，因此简单 key-to-string lookup 足够。

Reference: https://cldr.unicode.org/index/cldr-spec/plural-rules

## 4. `<html lang>` and fonts/screen readers

Browser 使用 `<html lang>` 影响 CJK glyph 选择；screen readers 也依赖它选择
正确的发音词典。Hindi 的 Devanagari 渲染在现代 OS 中都有系统字体，但正确
的 `lang="hi"` 仍是 accessibility 的核心。

References:

- https://drafts.csswg.org/css-fonts-3/#font-language-override-prop
- https://www.w3.org/International/articles/language-tags/

## 5. RTL preparation

`en`、`zh`、`hi`、`ru` 都是 LTR，但 `availableLocales` 仍包含 `dir` 并在每次
locale change 时应用。未来加入 `ar`、`he`、`fa` 只需要新增 locale metadata，
而不是重写整个 SPA。

Reference: https://www.w3.org/International/questions/qa-html-dir

## 6. Translation methodology

流程：

1. 找出 SPA shell 中所有 authored English literals。
2. 设计稳定 namespace，如 `nav.*`、`header.*`、`tutorial.*`。
3. 将 strings 翻译为 Russian、Simplified Chinese 和 Hindi，并参考 CLDR、
   W3C i18n materials、常见 UI terminology 和开源应用翻译。
4. 对 ambiguous source strings 保留上下文，使未来 native-speaker review 更容易。

Native-speaker review 不属于 PR #19 的完成条件；本 PR 通过 dictionary parity
和 UI smoke tests 防止结构性缺漏。

## 7. Platform matrix

现代 Chromium、Firefox、Safari、Capacitor iOS/Android 和 Electron 都支持
`navigator.languages`、`<html lang>` font behavior 和 `localStorage`。本项目
目标平台满足这些 API 前提。
