# Profile changes with fresh runner observations

PR: https://github.com/link-foundation/meta-sovereign/pull/57

The `13623bf7` runtime jobs fail the same assertion in
`runner-configuration.test.js:291`: the last probed target has no remote host,
where the test expects `new@example.invalid`. A focused local run reproduces it.
The controller correctly refreshes the local peer after starting the remote
runner. The last observation therefore cannot identify the launch address.

The test now finds the actual remote launch operation and checks its target,
checks every subsequent remote observation, and requires the returned local and
server states to be stopped and running respectively. It retains the original
assertion that Stop uses the previously running address after a profile edit.
All 19 focused profile and fresh-receipt tests pass with one worker.

Preserved exact-source failures include Node Linux job `134617834288`, lines
8749–8764; Node Windows `134617834233`, lines 17386–17401; Node macOS
`134617834284`, lines 6211–6225; Deno Linux
`134617834311`, lines 4216–4228; Deno macOS `134617834221`, lines 11345–11357;
Deno Windows `134617834162`, lines 15435–15449; Bun Linux `134617834014`,
lines 9372–9395; Bun macOS `134617834174`, lines 47798–47820; and Bun Windows
`134617834187`, lines 33819–33846. These are separate runtime jobs in the same
[Checks run](https://github.com/link-foundation/meta-sovereign/actions/runs/44249027554).

The actual [SSH backend job](https://github.com/link-foundation/meta-sovereign/actions/runs/44249027554/job/134615648129)
passes both Screen and Docker lifecycles on this source. Each receipt verifies
ready application health, both switching directions, retained private data and
closed resources. Docker also verifies foreign-container refusal. Packaged
desktop, security, pages and link workflows pass; the failing runtime gate
prevents accepting VD02. The issue still has 32 unfinished criteria.

[Evidence archive](data/runner-profile-receipt.tar.gz) includes the failed jobs,
actual receipts, focused before/after checks and exact verified sources, with
an independently checked SHA-256 manifest.
