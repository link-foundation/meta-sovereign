# Shared HH job browser profiles

Search, résumé listing, vacancy collection and résumé export previously omitted
an explicit profile directory. The shared browser factory selected the user's
default store and `browser-profiles/hh/slots/<slot>`. Application review selected
`browser-profiles/hh/<slot>` in its own workspace instead. The same named slot
could therefore use different cookies between reading and applying, and a custom
workspace's readers could inherit the default workspace's account.

Five new service regressions fail on parent `5512acf2`: four readers omit the
workspace path, and application review chooses the other directory. All five
pass after binding the service's browser dependencies to the workspace once.
The change covers CLI and server callers through their existing shared service.
CV watch, CV preparation and workplace review use the same resolver when attaching
to an existing browser. They remain connect-only and do not open replacement tabs.

New profiles use the shared factory layout, with separate workspaces and named
slots. The `main` slot retains the factory's platform-root layout. Existing
application profiles with Chromium state are reused at their original path when
no canonical profile exists. No cookie files or browser directories are moved,
copied or overwritten, including while an existing browser owns its profile.
Profile markers include Chromium state, the default profile, its singleton lock
and the browser-commander session descriptor. An empty parent containing only
other slots is not treated as an authenticated profile.

If both paths contain distinct profiles, launch refuses with
`jobs-browser-profile-conflict` rather than choosing an account. Close both
browsers, preserve the intended profile at `browser-profiles/hh/slots/<slot>`
(`browser-profiles/hh` for `main`), and archive the other directory before retrying.
The resolver does not merge accounts. A custom workspace does not copy the
default workspace's cookies; it requires its own sign-in.

Existing explicit library profile overrides and injected connectors remain
supported. Stored case and slot visibility still pass through the shared policy
resolver, including headed defaults and explicit headless runs. Set
`MS_JOBS_BROWSER_DEBUG=1` to report only the profile-selection category; default
execution is silent, and the trace contains no path, account or cookie values.

Local verification uses synthetic profile markers, owned temporary workspaces
and injected sessions, with no provider account or browser launch. The 14 regression
and resolver checks cover every affected reader, legacy retention, workspace/slot
separation, account-conflict refusal, connect-only attachment, policy precedence,
override compatibility and trace privacy. The 28 existing focused service/CLI/Lino
checks cover cancellation, ownership and the shared controls. Hosted runtime
and browser coverage remains required for the published source.

This fixes one HH01 integration defect. Interactive login/challenge controls,
complete persistent headed workflow acceptance and every other unchecked
criterion remain unfinished. PR57 remains draft and unmerged.

[Native cookie evidence](jobs-browser-cookie.md) additionally verifies clean
restart retention of a synthetic session cookie in the actual Chromium disk
profile, with independent slots and workspaces. Its four sequential headless
launches do not establish manual headed login or CAPTCHA acceptance.
