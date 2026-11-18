# VK25 sticker catalog work plan

All original unchecked requirements remain active in PR57.

- [x] Read the complete pinned enumeration, filter, keyword and greeting-ID
      scripts and their data shapes. Compare existing greeting and collection
      behavior; record each actual parity gap with current native method schemas.
- [x] Implement explicit account-scoped bounded catalog refresh, purchased/active
      and usable filtering, native keyword/category selection and persisted metadata.
      Preserve empty results, ownership, receipt and failure states accurately.
- [x] Provide reusable catalog metadata export through shared foreground CLI,
      default Lino and four-language collection controls. Keep provider credentials
      out of exported files and avoid untrusted arbitrary asset downloads.
- [x] Add minimal actual-parent regressions and focused Node/Deno interface,
      durability and lifecycle checks. Verify a native browser case and independent
      Playwright MCP; retain before/after phone and desktop screenshots.
- [ ] Review quality gates and production diff, preserve checked evidence,
      commit/push atomically and verify exact-head hosted workflows before accepting
      VK25. Continue every other original criterion; keep PR57 draft and unmerged.
