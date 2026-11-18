# Cancel unissued online refreshes after policy changes

The VD03 independent-controls audit found two actual defects in published
`5f982b17`. Refresh execution shared the settings queue, so disabling the policy
waited behind token/provider work. The online adapter also omitted the existing
post-rate-wait admission callback. Stop or credential changes during those waits
therefore failed to prevent the later POST, including a definite error-6 retry.

Refreshes now serialize separately from settings changes. The actual adapter
checks the frozen enabled/interval policy, current token and owned lifecycle
after every rate wait, immediately before POST. Changed admission is recorded as
`refused` with `policy-changed`, without a confirmation timestamp. Definite VK
error-6 backoff remains bounded; ambiguous transport failures are not replayed.
An already issued request still drains and retains its actual receipt. Explicit
manual refresh remains available when scheduling is disabled.

Reproduce with `python -B experiments/issue-56/vk-online-admission-before.py`.
It restores the exact published two production modules temporarily, runs the
finite real-adapter fixture, verifies fifteen failing admission cases and five
passing controls, and restores current bytes in `finally`. No network account
is used. Pauses cover token acquisition, intent acknowledgement, the actual
limiter and actual error-6 backoff. Config writes must finish before release;
Stop must drain. Disabling, changing interval, rotating a previously read token
or stopping prevents the next POST. Token rotation before the initial token read
correctly uses the current credential and remains a positive case.

The first draft incorrectly expected that last case to refuse. Its failing
local output is retained separately; the corrected test distinguishes first
credential acquisition from a later identity change. The parent still fails all
fifteen actual refusal cases. The remaining four unchanged controls preserve
normal acknowledgement, including one error-6 retry.

Run `js/tests/vk-online-admission.test.js` with the existing
`js/tests/vk-online.test.js` using a single test worker. Together they cover
twenty boundary cases and fourteen existing service, restart, storage refusal,
coalescing, CLI, both Lino encodings, server ownership and offline controls.
Node and Deno each pass all 34. Full runtime/platform coverage remains hosted.
No UI markup changes; existing translated settings and outcomes use the same
shared service and routes. This correction alone does not accept VD03 or any
other unfinished criterion. All forty remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

The [checked archive](data/vk-online-admission.tar.gz) and
[SHA-256 manifest](data/vk-online-admission.tar.sha256.json) retain the exact
parent, source modules, finite fixture and all local verification outputs,
including the first draft's invalid expectation and its correction.
