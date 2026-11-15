# Desktop execution and configuration audit

All original issue requirements remain active. PR57 stays draft and unmerged
until every criterion has implementation and verification evidence.

- [x] Re-read the pinned desktop README, complete requirements, Electron main,
      local/remote lifecycle, SSH installer, Lino store and CLI entry point. The
      reference's remote UI produces an installation script but does not establish
      a running remote process; implement actual SSH execution and observed status.
- [x] Map the complete pinned requirements, including missing stats, outgoing
      priority seeding, constrained token acquisition, per-session logs and
      invitation-default/reset requirements to explicit VD11–VD15 rows.
- [ ] Audit automatic local dependency preparation, independent policies,
      single-window controls, theme/language, layered configuration, live redacted
      logs and all five artifact/install paths against VD01–VD09.
      The [desktop clipboard bridge](desktop-clipboard.md) now checks the owned
      main frame and origin, requires a successful native receipt and shows
      refusal. Browser fallback remains available without a desktop bridge.
      Hosted native clipboard verification passes on `36ee8ba8`, including
      asynchronous completion, actual readback and foreign-origin refusal;
      the wider logging and exact-head platform acceptance remain required.
- [ ] Implement remaining local/remote lifecycle and configuration gaps through
      shared CLI, Lino API and UI controls. Preserve stopped defaults and refuse a
      mode switch when the other process cannot be confirmed stopped.
      The shared handwritten CLI parser is now replaced by the actual
      `lino-arguments` parser with existing command value conventions retained;
      [Layered desktop configuration](desktop-configuration.md) now shares the
      server loader, with owned TLS navigation and production staging gates;
      native hosted verification, shared editing and runner control remain required.
      [Legacy priority reads](legacy-priorities.md) now normalize empty/singleton
      saved lists across all policies, with strict writes and actual protected-user
      cleanup checks; other configuration lists and hosted acceptance remain open.
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
archive. Diagnostics head `6e2116d9` still needs its hosted matrix. The
[desktop lifecycle correction](desktop-lifecycle.md) has finite parent/current
evidence; all 60 unchecked inventory rows retain their requested scope.
