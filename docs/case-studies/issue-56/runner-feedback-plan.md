# Observed runner action confirmations

The pinned desktop UI requirement calls for a floating confirmation at the top
of the viewport after Start or Stop. The shared runner controls currently show
only inline observations. This work fills that part of VD06; it does not complete
the remaining desktop execution or installation requirements.

- [x] Add a regression proving an explicit, acknowledged Start or Stop produces
      one confirmation, while pending, refused, ambiguous, recovered and late
      results cannot produce success feedback.
- [x] Keep confirmation ownership in the shared runner state model. Retain it
      only while later observations agree; status reads cannot create or replay it.
- [x] Render a translated, dismissible, finite confirmation at the top center of
      the viewport, with polite announcements and no focus transfer. Describe
      only the named isolated session, separately from application readiness.
- [x] Extend the existing mandatory browser scenario with observed Start/Stop,
      dismissal and negative-state assertions. Capture the missing parent state
      and fixed desktop/phone state in a finite private fixture.
- [ ] Run focused checks with bounded concurrency, independently review the UI
      through Playwright MCP, rebuild the web bundle, preserve evidence and update
      PR #57. Leave full runtime/platform matrices to GitHub CI.

All provider and session fixtures are synthetic. No session tools, SSH target or
live provider account is launched by these checks. The full issue objective and
all unfinished acceptance criteria remain active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
