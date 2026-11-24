# Membership locale size regression

The Checks workflow for `8ff2040c9ddbd501409705908f2304e5a0753fd5`, run
`42755799003`, was created on 2026-11-10 at 04:25:38 UTC. Its file-size
and ESLint jobs failed because the two new membership recovery translations
brought `ru-chat.js` to 1,501 lines. The aggregate pipeline correctly failed.

The preserved full log records the line-limit error at line 1109 and the
ESLint file path/error at lines 1515–1516. The checked merge preview included
the current main commit `1dc578350c2404b4d6aa12b3530cd3459dae2d1a`.
This was a source organization regression, not an environment timeout.

Extracting the existing invite-preview translation block into small
`*-chat-invite.js` modules in all four languages retains every key and value
and leaves room in the parent dictionaries. The locale contract checks,
focused strict lint and production bundle verify the extraction. No limits,
warnings or tests are disabled. The next exact-head CI result remains required.

Raw logs, workflow metadata and focused validation are preserved in
[`data/ci-membership-locale.tar.gz`](data/ci-membership-locale.tar.gz), with
per-entry hashes in the adjacent manifest. The issue-wide unfinished
requirements remain tracked in [the plan](PLAN.md).
