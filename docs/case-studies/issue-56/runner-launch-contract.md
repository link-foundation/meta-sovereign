# Named runner launch contract

The desktop preparation audit found a concrete launch refusal before any
dependency installation: our local and SSH launches passed `--name` to
`link-foundation/start`. The pinned desktop reference uses that flag, but current
start documents and parses `--session` / `-s` for the isolation session.
Its wrapper parser rejects unknown flags before executing the command.

Source inspection used start commit
`3872bd031f5b51902e20bd22b84e9d51a59fcc0b`, including the README, argument
parser and screen implementation. The desktop reference remains
`8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1`. None of that third-party code
was installed, built or executed. The reference's optimistic fake transports
do not validate wrapper arguments, so copying its invocation contract into
our tests preserved the incompatibility.

Both local and SSH launches now pass the supported `--session` selector before
the command separator. The configured session, detached screen isolation,
literal command arguments and explicit noninteractive server options are
preserved. No alternate isolation backend or automatic dependency preparation
is claimed by this correction.

```sh
node experiments/issue-56/runner-launch-contract.mjs
node --test --test-concurrency=1 js/tests/runner-control.test.js js/tests/runner-controller.test.js js/tests/runner-transport.test.js
```

The finite admission assertion fails on parent `a3f52621` because it receives
`--name` instead of `--session`; it passes with the correction. Nineteen focused
checks pass, including a controller regression for both modes whose transport
refuses the unsupported wrapper selector. These are contract and owned-fixture
checks, not a claim of a real upstream installation or remote deployment.
Full runtime/platform validation remains assigned to exact-head CI.

The same source defect was reported with a minimal reproduction, source links,
workaround and suggested regression in
[vk-bot-desktop issue 59](https://github.com/konard/vk-bot-desktop/issues/59).
The report explicitly distinguishes source inspection from execution.

[Verified evidence](data/runner-launch.tar.gz) and
[hash manifest](data/runner-launch.tar.sha256.json) retain the parent source,
source references, admission failure, passing checks and upstream report.
All 60 unchecked inventory criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), including
automatic preparation and independent desktop job ownership.
