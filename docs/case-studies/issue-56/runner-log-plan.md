# Runner session logs and trigger timing

VD14 remains required in [PR57](https://github.com/link-foundation/meta-sovereign/pull/57).
The pinned desktop requirements 18–20 require verbose logging by default, an
independent redacted file for every successful or failed session, and observable
trigger admission/completion timing. A rotating aggregate and an in-memory tail
cannot preserve that evidence after restart.

- [x] Read the pinned requirements and logger, and trace CLI, desktop, rolling
      worker, journal and shared automation scheduling ownership.
- [x] Persist an independent private session file for each owned server runtime,
      including startup and shutdown failures. Drain before final close; retain
      aggregate logging and keep memory test fixtures separate.
- [x] Add default-on configurable verbose logging through CLI/environment,
      acknowledged Lino API settings and translated UI. Errors remain visible.
- [x] Trace actual scheduled trigger admission, completion and failure with
      elapsed time; preserve existing confirmation and delivery states.
- [x] Add finite parent/current regressions, focused runtime checks and native
      and independent MCP UI evidence. Do not run full matrices locally.
- [ ] Archive sources, logs, screenshots and hashes; review and push an atomic
      commit and update the PR. Keep all other unmet criteria active.
- [ ] Review all exact-head hosted workflows before accepting VD14. Passing
      checks alone do not establish the other 59 unchecked inventory criteria.
