# Chat model experiment formatting

The Checks workflow for `00d1f9e1d15bd23eaf37ec0c9e14d851f4bdc1c1`, created at 2026-11-11 03:57:04 UTC, failed its lint prerequisite. Full log lines 2715–2744 identify fourteen Prettier errors in `experiments/issue-56/chat-model-mcp.mjs`; pipeline lines 5013–5015 report only `lint: failure`. Runtime/browser jobs were consequently skipped. The four other ESLint findings are existing warnings and did not fail the gate.

A focused Prettier check reproduces the formatting failure. Formatting that exact experiment and running strict scoped ESLint plus Prettier passes. The experiment's function body is unchanged; no product code or quality gate is modified.

Playwright MCP's filename runner wraps its input as a function expression. When replaying this formatted source through that runner, copy it into an ignored temporary file and strip only the final statement semicolon. Keep the tracked JavaScript normally formatted. Directly supplying its function expression to the tool also works. This is an execution adapter requirement, not a reason to exempt the tracked source from lint.

The original 59-file chat-model evidence archive records the preceding experiment bytes and remains immutable. The separate CI archive retains this workflow's full log, timestamp/SHA list, the failing-before formatting check, passing scoped checks and the formatted source. Current-head hosted verification and every unfinished issue criterion remain required. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft and unmerged.
