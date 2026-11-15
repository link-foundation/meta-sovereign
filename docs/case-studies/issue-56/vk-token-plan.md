# Constrained VK token acquisition

PR57 remains draft and unmerged. VD13 and every other unchecked requirement
remain required until implementation and verification are evidenced.

- [x] Re-read the pinned desktop requirements and authorization implementation,
      existing VK read-only token inspection, protected storage and desktop
      lifecycle. The Kate Mobile action must use the exact standalone blank
      redirect, never the rejected localhost callback. Historical API refusals
      do not establish current authorization or message capability.
- [x] Implement an owned, cancellable acquisition service with strict token/URL
      parsing, read-only validation, acknowledged encrypted saving and truthful
      failure/capability states. Preserve an existing token on failed saves.
- [x] Wire a constrained Electron authorization window, shared CLI, both Lino
      encodings and translated Connections controls. Do not persist pasted
      credentials in browser preferences or expose redirect URLs in receipts.
- [x] Add finite parser, navigation, lifecycle, protected-persistence and
      transport regressions. Verify the relevant native browser scenario and
      independent MCP desktop/phone/localization states with owned fixtures.
- [x] Archive sources, raw checks, screenshots and hashes, review the complete
      atomic change, commit/push and update PR57 with reproducible commands.
- [x] Correct the browser registry command and finite Electron entry readiness
      cycle, with parent/current regressions and a terminating deadline.
- [ ] Inspect all exact-head workflows and failure logs before accepting VD13.

Electron's security and window APIs were rechecked against its official
[security guidance](https://www.electronjs.org/docs/latest/tutorial/security),
[BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)
and [webContents API](https://www.electronjs.org/docs/latest/api/web-contents).
Reference behavior is studied; its implementation is not copied.
