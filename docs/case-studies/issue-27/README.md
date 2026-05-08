# Issue 27 Case Study: DRY Connections UI

Issue: https://github.com/link-foundation/meta-sovereign/issues/27

Prepared on 2026-05-08 UTC for PR 28.

## Summary

Issue 27 follows up on issue 25. The core complaint was that data-heavy
sections repeated the same provider setup UI inline, while the dedicated
Connections section did not own the actual connection controls. That made
the app feel noisy, duplicated, and harder to learn.

The implemented solution makes Connections the single source of truth for
provider setup. Data sections now keep their empty-state explanation and a
small button that deep-links to the relevant provider detail. Each provider
detail now contains instructions, credential fields, archive import, and the
direct probe action.

## Local Artifacts

Raw GitHub data is preserved under `data/`:

- `issue-27.json` and `issue-27-comments.json`
- `issue-25.json` and `issue-25-comments.json`
- `pr-28.json`, `pr-28-conversation-comments.json`,
  `pr-28-review-comments.json`, and `pr-28-reviews.json`
- `pr-26-related.json`, `pr-26-conversation-comments.json`,
  `pr-26-review-comments.json`, and `pr-26-reviews.json`

Final local verification logs are preserved under `verification-logs/`:

- `local-npm-test-final.txt`
- `local-npm-lint-final.txt`
- `local-npm-format-check-after-logs.txt`
- `local-jscpd-final.txt`
- `local-build-web-final.txt`
- `local-e2e-browser-run-final.txt`

Referenced issue 25 screenshots are preserved under `screenshots/`:

- `issue-25-desktop-current.png`
- `issue-25-mobile-current.png`

Final verification screenshot:

- `final-connections-telegram-detail.png` shows the Telegram provider detail
  owning setup instructions, credential fields, archive import, and the direct
  probe button.

The container did not include the `file` utility, so the downloads were
validated with PNG magic bytes instead:

```text
89 50 4e 47 0d 0a 1a 0a
```

## Timeline

- 2026-05-06 18:23 UTC: Issue 25 opened with the broader mobile-first,
  translated, connection-centric UI vision.
- 2026-05-06 18:23 UTC: PR 26 opened for issue 25.
- 2026-05-06 20:08 UTC: PR 26 merged. It added the AppShell, Connections
  module, provider list/detail instructions, and tutorial spotlight, but left
  provider credential/import/probe controls in Settings and data-page guides.
- 2026-05-08 10:52 UTC: Issue 27 opened to call out the remaining duplication.
- 2026-05-08 10:53 UTC: Draft PR 28 opened for issue 27.

## Observed Problem

The issue 25 screenshots showed data-page empty states with full provider
cards inline. Each card repeated archive instructions, API credential hints,
docs links, and probe affordances. At the same time, Connections had a
provider grid and instruction detail pages, but the operational controls
still lived elsewhere. This created two mental models:

- Data sections told users to "connect below" and exposed setup content inline.
- Connections looked like the right destination, but did not contain the full
  setup surface requested by the issue.

## Root Causes

1. `ConnectionGuide` was doing two jobs: empty-state education and provider
   setup rendering. The guide was reused by many data surfaces, so every
   provider card rendered repeatedly.
2. `SettingsView` owned credential saving, archive import, and direct probes.
   That ownership conflicted with the new issue 25 Connections module.
3. The app's deep-link contract still targeted Settings anchors
   (`#conn-{provider}`) instead of provider details inside Connections.
4. Tests encoded the old Settings ownership path, so the issue 27 invariant
   was not protected: data surfaces should link to Connections, not render
   setup controls.

## Implemented Fix

- Replaced inline provider cards in `ConnectionGuide` with a compact
  Connections CTA that dispatches `meta-sovereign:navigate` to the Connections
  view and preserves `#conn-{provider}` anchors.
- Moved credential forms, archive import, and direct probes into
  `ConnectionDetail`.
- Kept `SettingsView` as an app-level preferences page and added a clear
  button to open Connections.
- Updated Connections routing so direct hashes open the matching provider
  detail and the Back action clears the provider hash.
- Updated localized copy so data empty states point users to Connections while
  keeping existing provider instructions and text in the app.
- Added regression tests that fail if data guides render provider setup cards
  or if provider details do not own credentials/import/probe controls.

## External Project Issues

No external upstream issue was filed. The problem was caused by local
component responsibility and routing decisions, not by a third-party defect.

## Verification Plan

The PR should be accepted only when these checks pass. Local verification on
2026-05-08 UTC completed the list:

- Focused render tests for `ConnectionGuide`, `ConnectionDetail`, i18n parity,
  and credential round-trip.
- Full project test suite.
- Lint and format checks.
- Duplication check.
- Web bundle rebuild.
- Browser verification of the Connections CTA and provider-detail controls.
