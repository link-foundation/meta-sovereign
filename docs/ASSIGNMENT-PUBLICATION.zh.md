# 测试任务仓库 (languages: [en](ASSIGNMENT-PUBLICATION.md) • zh • [hi](ASSIGNMENT-PUBLICATION.hi.md) • [ru](ASSIGNMENT-PUBLICATION.ru.md))

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) 为任务暂停流程增加经用户审阅的 GitHub 发布。在**更多 → 表单**打开表单、选择配置并规划答案。识别到测试任务后，普通答案及 PDF 上传会暂停，直到确认任务仓库。原有的验证并保存仓库链接功能仍然可用。

先在问题/表单设置中启用本地草稿模型。发布使用服务器已登录的 `gh` 和 Git 凭据，凭据保留在服务器。填写 `owner/repository`、公开/私有可见性，可选 HH 职位 URL 和雇主别名。生成草稿只读取上下文并保存私有预览，不创建仓库或 issue。核对完整英文 issue、要求、语言、技术栈、模板来源和可见性后，明确执行发布。服务器不具备该能力时，发布控件不可用。

职位 URL 在独立受控浏览器中打开，遵循已保存的 `assignments` 浏览器策略，默认显示窗口。需要时手动登录。读取器获取可见的标题、雇主、技能和描述，关闭浏览器，仅缓存成功结果；刷新需要明确操作。已保存 HH 消息中的准确表单链接可以关联职位，支持原始及重定向 URL 别名。关联冲突时须明确提供 URL。没有关联时，预览会说明职位上下文不可用，模型选择适合的受支持技术栈。

表单链接到独立 HTML 或纯文本任务时，填写指令文档 URL。指令通过另一受控浏览器读取，使用相同可见性策略。审阅草稿旁显示的最终页面标题和采集时间。私有草稿保存文本及指纹；恢复和发布使用该快照，不重复读取。隐藏文本、可编辑答案和表单值不参与提取。登录、验证、HTTP 错误、PDF/canvas/嵌入文档或超出有限读取上限都会在调用模型前拒绝。此类文档需要可读的文本版本。读取器不会自动遍历后续链接。

优先读取 Hive Mind 当前主要 **Recommended CI/CD Templates** 表格，再使用内置备用列表；预览标明备用来源。职位明确指定的语言优先于偶然出现的技术。GitHub 模板使用 `gh repo create --template`，其他模板仓库保留历史克隆并推送。现有用户文件保留，补充缺失的 workflow 及模板历史；已有流水线保留。重新预览后再次发布会更新唯一标记的任务 issue，并修复缺失的流水线。

本地保守检查覆盖英文表述、已知雇主名称及词形/音译，以及两个来源（包括文档标题）中的连续六词复制。请自行核对准确性及系统无法推断的别名。书面任务 issue 保留 **Deliverable and stack** 和末尾 **Stack**：要求在 `docs/` 中以原始语言编写 Markdown、遵守篇幅限制、提出合适技术栈，并在 README 链接结果。发布确认仓库、workflow 文件和 issue 回读结果，不代表任务已实现、CI 已通过或雇主表单已提交。

## CLI

通过 `--file` 使用 `forms-read` 保存的检查结果，或用 `--url` 检查实际表单。使用现有 `answers model` 命令配置模型。

```sh
meta-sovereign test-assignment task-name --file=inspection.json --vacancy=https://hh.ru/vacancy/12345 --visibility=private --employer='Employer alias' --dry-run --store=./store
meta-sovereign test-assignment owner/task-name --file=inspection.json --vacancy=https://hh.ru/vacancy/12345 --visibility=private --store=./store
meta-sovereign test-assignment owner/task-name --file=inspection.json --source=https://example.org/instructions --dry-run --store=./store
meta-sovereign test-assignment --draft-id=assignment-draft:UUID --store=./store
```

仅提供名称时解析当前已登录所有者，也可指定 `--owner`。默认私有。`--dry-run` 保存并打印预览，否则 CLI 发布生成的草稿。通过 `--draft-id` 恢复打印出的准确 `draft.id`，不会再次运行模型。可用有界 Lino `--vacancy-snapshot` 提供 `title`、`description`、`company`、`skills`，与职位 URL 二选一。`--refresh-vacancy=true` 重新读取 URL。SIGINT/SIGTERM 会停止并等待所属模型、浏览器和命令工作结束，然后关闭存储。

## API 和恢复

可信 POST 接口使用现有文本/二进制 Lino 协商：

| 接口                            | 输入                                                                                                                               | 结果                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/api/forms/assignment/draft`   | `inspection`、当前任务 `revision`、`target`、`visibility`；可选 `vacancyUrl`/`vacancy`、`sourceUrl`、`refreshVacancy`、`employers` | 私有 `draft`、可选 `sourceEvidence`、`state: draft`       |
| `/api/forms/assignment/restore` | `inspection`、当前任务 `revision`                                                                                                  | 已保存草稿及是否尝试发布；无 GitHub/模型调用              |
| `/api/forms/assignment/publish` | `draftId`                                                                                                                          | 已确认的仓库、issue 和新任务修订，或保留 `uncertain` 阶段 |

发出外部写入前，先将私有意图持久化。响应丢失会保持不确定状态及表单暂停。恢复同一次发布会检查实际标识和标记 issue 的回读，不重复结果未知的创建操作。重新打开表单后读取并规划，恢复保存的草稿，再恢复该草稿的发布。任务/模型变更、另一待处理草稿、仓库重建或用户编辑 issue 会拒绝过期发布。没有明确确认的结果仍需人工检查。

私有版本 1 命名空间：`assignment-draft:`（审阅文本/上下文）、`assignment-publication:`（已发出操作/回执）、`assignment-vacancy:`（成功快照）、`form-vacancy:`（准确别名及 HH 消息来源）。现有记录结构保持兼容。这些记录可能包含私有任务/职位文本，遵循普通备份和存储策略。可选标识/状态跟踪使用默认关闭的问题诊断。

参见[发布实现及验证](case-studies/issue-56/assignment-publication.md)和[指令读取验证](case-studies/issue-56/assignment-source.md)。完整提供商流程和 issue 56 的其他未勾选要求仍未完成。
