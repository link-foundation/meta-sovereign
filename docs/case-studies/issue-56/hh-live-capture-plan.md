# HH11 live browser capture

Keep HH11 and every other original incomplete requirement open until the
complete reference behavior and exact-head verification are recorded.

- [x] Read the pinned recorder, history writer and pane-transition guard. Trace
      current-document watches, canonical archive checkpoints and send guards.
- [x] Reject cross-chat message reuse and changed native pane metadata before
      capture or action, including a URL that changes before its old pane.
- [x] Snapshot native message mutations immediately during an explicitly
      confirmed current-chat watch. Bound pending data, serialize acknowledged
      canonical writes, preserve text versions and native delivery corrections.
- [x] Refuse further automation after a capture gap or failed save. Stop and
      shutdown must disconnect observers and drain admitted snapshots; recovery
      and status must never restart a watch or replay a provider action.
- [x] Add actual-parent regressions, focused checks, one finite native browser
      fixture and independent MCP inspection. Keep default-off diagnostics free
      of message bodies, drafts, tokens and private URLs.
- [x] Explain the behavior through the existing CLI, text/binary Lino and four
      translated watch controls. Preserve checked local/native/MCP evidence.
- [ ] Inspect all fresh exact-head hosted checks before accepting any requirement.
- [ ] Complete all-unread orchestration, other-window ownership and authenticated
      provider parity before accepting HH11. Every other unchecked requirement
      remains active in PR57.

The initial root cause is an architectural gap: the current-chat watcher polls
the mounted tail, while the archive scanner checkpoints only explicitly visited
windows. Neither records an edit that appears and disappears between polls.
Routing and document identity also do not bind a reused native message to its
previous chat when an SPA changes its URL before replacing the conversation.
