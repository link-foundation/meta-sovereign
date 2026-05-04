# UI 设计审计 (languages: [en](UI-DESIGN-AUDIT.md) • zh • [hi](UI-DESIGN-AUDIT.hi.md) • [ru](UI-DESIGN-AUDIT.ru.md))

本审计把当前 SPA 表面映射到 Apple Human Interface Guidelines、Google
Material Design 和 Microsoft Fluent 指南。它保持实践导向：每个表面都根据
当前 app 能在测试和 code review 中保持的具体行为检查。

参考：

- Apple Human Interface Guidelines: <https://developer.apple.com/design/human-interface-guidelines/>
- Google Material Design accessibility: <https://m1.material.io/usability/accessibility.html>
- Microsoft Fluent 2 accessibility: <https://fluent2.microsoft.design/accessibility>

## Global Shell

| Check                       | Status | Evidence                                                             |
| --------------------------- | ------ | -------------------------------------------------------------------- |
| 语义 landmarks 便于快速定位 | Done   | `src/web/index.html` 和 `src/web/dom.js` 使用 header/nav/main 结构。 |
| 键盘优先访问主内容          | Done   | Skip link 是第一个可聚焦元素，并由 `stepSkipLink` 覆盖。             |
| 所有交互控件有可见 focus    | Done   | `src/web/app.css` 定义 focus-visible outline。                       |
| Light/dark/system 外观      | Done   | Theme toggle 会持久化，并由 `stepThemeToggle` 覆盖。                 |
| 严重 a11y 违规会让 e2e 失败 | Done   | `stepAxeAudit` 运行 axe-core WCAG 2.0 A/AA checks。                  |

## Chat

| Check                              | Status | Evidence                                              |
| ---------------------------------- | ------ | ----------------------------------------------------- |
| 消息按 conversation source 分组    | Done   | Chat view 渲染规范化的 `msg:*` links。                |
| Composer 支持重复回复              | Done   | Autocomplete 使用已有 outgoing messages 和 fallback。 |
| Empty/offline state 不阻止本地工作 | Done   | Offline client 会先写本地。                           |

## Operator

| Check                      | Status | Evidence                                |
| -------------------------- | ------ | --------------------------------------- |
| Primary actions 可键盘访问 | Done   | DONE/NEXT 和 submit shortcuts 已实现。  |
| Work queue 聚焦单一上下文  | Done   | Operator card stream 一次显示一个任务。 |
| Semi-auto 建议可审计       | Done   | `automationHandler` 持久化 `plan:*`。   |

## Contacts、CRM、Automation、Settings

Contacts detail 汇总 messages、networks、chats 和 facts；audience/outreach
UI 在排队前预览 envelopes；graph steps 持久化为稳定 nodes/edges；backup、
sync 和 server discovery 在真实 e2e 中验证。Secrets 使用 `secret:*` 加密并从
peer sync 过滤。

## UI Stack Status

当前 React SPA 保留了设计行为审计。R-G1 由 React shell、React view
components 和真实浏览器 e2e 覆盖。
