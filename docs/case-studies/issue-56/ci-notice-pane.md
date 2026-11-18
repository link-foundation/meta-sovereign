# Observe the pane refusal before the text guard

Published `dc876f723c8b95c961e266e5b39ebbc2ff23bad7` triggered Checks and release
run [43806850080](https://github.com/link-foundation/meta-sovereign/actions/runs/43806850080)
at 2026-11-16 04:54:15 UTC. Chromium shard 4
([job 133100713162](https://github.com/link-foundation/meta-sovereign/actions/runs/43806850080/job/133100713162))
fails in the employer-change notice scenario. The preserved job log lines
1165–1195 show `answer-chat-unverified` where the assertion at the then-current
`e2e-notice-policy.mjs:205` expects `answer-text-changed`.

The production watch now attaches active history capture. Its flush reads the
shared pane identity before permitting a reply. `browserPaneIdentity` remembers
the observed employer/vacancy fingerprint and refuses a replacement header with
`answer-chat-unverified`. That is the expected earlier refusal; the text sender
never reaches its frozen notice-context comparison. The test still expected the
older sender-only path.

The existing scenario is exported separately so one finite native Chromium probe
can reproduce this failure without running the complete browser group. With the
old assertion, that probe reproduces the exact actual/expected mismatch. The
corrected assertion requires the specific pane refusal and now also requires a
failed outbox and zero option clicks. Existing zero text sends, empty draft,
paused state and released ownership assertions remain. No production guard,
deadline or CI gate changes.

```sh
node experiments/issue-56/ci-notice-pane-browser.mjs
node --test --test-concurrency=1 --test-name-pattern='question provider and control scenarios' js/tests/ci-contracts.test.js
```

The one native scenario and mandatory browser registration contract pass. The
probe closes its isolated browser and fixture context, uses routed synthetic
pages and sends from no account. The scenario remains inside `verifyNoticePolicies`
in the mandatory Chromium/WebKit CI group. Full exact-head hosted acceptance
remains required; all 60 unchecked issue criteria remain unfinished in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/ci-notice-pane.tar.gz) and
[hash manifest](data/ci-notice-pane.tar.sha256.json).
