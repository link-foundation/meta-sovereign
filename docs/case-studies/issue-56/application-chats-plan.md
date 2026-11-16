# Application-owned chat worker

Pinned workflow C14 requires an independent automatic chat child with a 120 minute default interval, stopped and drained when its application owner exits. C1/C15 require a separate browser slot, held review and continued application work. HH10 remains unchecked until this lifecycle and provider evidence are complete.

- [x] Normalize explicit batch chat intent for CLI, both Lino transports and the shared Applications UI. Preserve old acknowledged batch signatures and read-only recovery. Preview must not spawn a child.
- [x] Spawn an actual child through the existing process supervisor. Use the authenticated, bounded local Lino control channel; the application parent retains the single canonical store writer and browser service.
- [x] Prepare a separately named persistent chat slot, default visible. Reuse the existing unread answer pass, outbox guards, model opt-in, held review and owner-focus protections. Never silently borrow the application slot.
- [x] Keep application progress independent of ordinary chat review. Expose truthful child/pass state and log the held title and URL. Failed login/worker startup must remain visible without reporting success.
- [x] Drain the child, admitted chat work and owned browser on stop, expiry, application completion, startup failure and service shutdown. No status call or restart may recreate it.
- [x] Add focused regression checks including a real child PID and simultaneous application/chat ownership, before/after UI evidence, shared UI localization and mandatory hosted registration.
- [ ] Preserve commands, results, source, screenshots and hashes; review changes, commit and push only the prepared branch; update PR #57 and inspect exact-commit CI. Keep the broader issue inventory unfinished where evidence is missing.
