# Desktop execution and configuration audit

All original issue requirements remain active. PR57 stays draft and unmerged
until every criterion has implementation and verification evidence.

- [x] Re-read the pinned desktop README, complete requirements, Electron main,
      local/remote lifecycle, SSH installer, Lino store and CLI entry point. The
      reference's remote UI produces an installation script but does not establish
      a running remote process; implement actual SSH execution and observed status.
- [ ] Audit automatic local dependency preparation, independent policies,
      single-window controls, theme/language, layered configuration, live redacted
      logs and all five artifact/install paths against VD01–VD09.
- [ ] Implement remaining local/remote lifecycle and configuration gaps through
      shared CLI, Lino API and UI controls. Preserve stopped defaults and refuse a
      mode switch when the other process cannot be confirmed stopped.
- [ ] Add finite regressions for precedence, protected secrets, remote quoting,
      positive process receipts, ambiguous SSH failures and draining shutdown.
      Use mock transports locally; full platform/runtime coverage belongs in CI.
- [ ] Capture native and independent MCP before/after evidence for UI changes;
      archive sources, logs and hashes, commit/push atomic steps and update PR57.
- [ ] Inspect every exact-head workflow and all failed logs before accepting
      inventory rows. Passing CI alone does not establish feature parity.

Pinned source: `konard/vk-bot-desktop` at
`8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`. Source blobs are retained in
the local `vk-desktop-reference-*` research files for the checked evidence
archive. Current first-live-history head `77ac37e3` still needs its hosted
matrix; all 55 original unchecked inventory rows retain their requested scope.
