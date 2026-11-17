# WebKit reload investigation

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
The five workflows started at 2026-11-17 01:28:46 UTC for commit
`6a2b60cbd8adbbfbdcc652a7ea56e6de81224793`. Four passed. Main run
[43995881927](https://github.com/link-foundation/meta-sovereign/actions/runs/43995881927)
failed only in WebKit shard 2, job 133749902791.

The preserved job log reports `page.reload: The network connection was lost.`
at line 2248; lines 2703 and 2714 identify chat-loading and exit status 1.
The downloaded browser artifact shows chat 43 after automatic scrolling,
locating the failure at the Stories persistence reload. This is a navigation
failure, with no failing product assertion or JavaScript exception identified.
The full-run log request exceeded GitHub CLI's request limit; the complete
failed-job log and the relevant browser artifact are preserved instead.

Both bounded local WebKit checks pass: one with the original test and one with
added diagnostics. The historical root cause remains unconfirmed. The test now
names both reload checkpoints, and opt-in `CI_BROWSER_DEBUG=1` tracing records
failed requests with query values and fragments omitted. The default installs
no request listener. Twelve focused diagnostic tests pass. No assertion,
retry policy or timeout is weakened; future navigation failures still fail CI.

The [checked evidence archive](data/ci-webkit-reload.tar.gz) and
[manifest](data/ci-webkit-reload.tar.sha256.json) include exact-source workflow
metadata, the failed-job log, downloaded failure screenshot, both focused
browser logs, diagnostic tests and source changes. Fresh hosted verification
and all 40 unchecked issue criteria remain required.
