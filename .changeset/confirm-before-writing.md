---
'meta-sovereign': minor
---

Nothing is written to another service without your explicit
confirmation; reading still happens as needed.

- Every route that sends, posts or changes something elsewhere
  (`/api/send`, auto-mode `/api/automations/run`,
  `/api/automations/drafts/send`, `/api/email/send`,
  `/api/github/post-comment`, `/api/upwork/post-message`,
  `/api/peopleperhour/post-message`, `/api/broadcast`, outreach
  `queue`, greetings `queue`, CV `apply`, and the new
  `/api/profile/sync` / `/api/resume/sync`) first answers
  `428 Precondition Required` with a preview and a single-use token
  bound to that exact request; the app asks you, and the server then
  performs exactly the previewed plan (greetings and CV apply no longer
  re-plan at send time).
- Saving your profile or CV only saves it; "Update other services" on
  the Profile screen publishes it to the networks you tick, after a
  confirmation that names them. Storing or syncing `broadcast:*`,
  `outreach:*`, `profile:*` or `resume:*` links no longer sends anything.
- Schedule and incoming-message automations only prepare drafts, even in
  auto mode; a manual auto-mode run shows how many messages will go out
  and sends only the confirmed drafts, never twice.
- "Typing…" is no longer shared automatically: turn it on in
  Settings → Privacy (off by default), and suggestion chips never send it.
- The `/ws` sync and `/rtc` signalling sockets refuse pages from other
  websites (same allow-list as HTTP CORS).
- CLI: `greetings-send`, `cv-sync --apply` and auto-mode `automations
run` show the plan and ask y/N (`--yes` for scripts); `--limit` is
  capped at 100.
