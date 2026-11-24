# 运行应用检查（语言：[en](RUNNER-HEALTH.md) • [ru](RUNNER-HEALTH.ru.md) • [hi](RUNNER-HEALTH.hi.md) • zh）

打开 **设置 → 运行会话 → 显示会话控制 → 检查应用**，明确检查已配置的本地或 SSH
目标。会话状态与最近应用检查是不同的观察结果。打开面板不会检查应用；关闭会取消
面板拥有的请求并忽略迟到回复。开始新操作或会话观察状态改变时清除最近检查。
检查不会安装、启动或停止任何程序。

```sh
meta-sovereign runner inspect local --profile=/absolute/path/runner.lino
meta-sovereign runner inspect server --url=http://127.0.0.1:8787
meta-sovereign runner health --store=/absolute/path/store
```

`inspect` 使用配置的目标及 SSH 传输。修改配置后，保留的运行中或状态未知目标仍可
检查；检查不会授权启动新目标。已停止或未配置的会话不执行应用命令。`health` 读取
所选存储的运行主机私有控制通道，不打开存储或运行配置。主机需要此版本的 rolling
服务器。旧主机或缺失主机返回 `unknown`；公共端口上的其他服务无法确认应用健康。

`GET /api/runner/inspect?mode=local` 或 `mode=server` 提供相同读取，使用默认文本/
二进制 Links Notation 以及现有口令和 origin 规则。CLI/API 只能选择已配置模式，
不能提供任意远程路径。

结果为 `ready`、`locked`、`degraded` 或 `unknown`。`ready` 表示所属应用工作进程
响应并报告存储健康，不确认已启用任务或消息送达。`locked` 需要解锁才能使用受保护
功能；`degraded` 表示存储问题。`unknown` 包含取消、启动/切换进程、控制通道不可用、
无效回复及传输失败。CLI 退出码零确认读取了 `ready`、`locked` 或 `degraded`，
此规则适用于 `runner health`；`inspect` 在确认会话已停止或未配置、跳过应用读取时
也会返回零。两者均不代表任务成功。

工作进程请求限制为两秒和 16 KiB 回复；私有控制读取限制为 2.5 秒。配置命令限制为
十秒，会取消所属传输，并等待子进程关闭后再释放控制器。投影回复不包含凭据或远程
诊断。不会自动重放变更操作。

[复现与验证证据](case-studies/issue-56/runner-health.md)。自动依赖准备和独立 desktop
任务所有权仍是 [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) 的必要工作。
