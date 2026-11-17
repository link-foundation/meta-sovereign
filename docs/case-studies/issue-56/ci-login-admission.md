# Manual HH login command admission

The exact published source `d517e9d4` fails the unchanged command-inventory
assertion in three hosted jobs:

- [Windows Node shard 2](https://github.com/link-foundation/meta-sovereign/actions/runs/44159748214/job/134313641214), raw log lines 3895–3930.
- [Linux Bun](https://github.com/link-foundation/meta-sovereign/actions/runs/44159748214/job/134313641900), raw log lines 1220–1265.
- [Linux Deno shard 1](https://github.com/link-foundation/meta-sovereign/actions/runs/44159748214/job/134313642275), raw log lines 4425–4454.

The manual login handlers and help were registered, but the lightweight public
entry point's admission list omitted all three `vacancies-login-*` names.
Consequently public invocation returned usage before reaching those handlers.
Direct handler tests could not detect this. The existing complete registry
comparison correctly found the mismatch; it remains unchanged.

Register open, status and close in the admission list. An additional regression
invokes the actual public entry point for each name with a reserved option.
It must reach argument validation and return the generic invalid-arguments
diagnostic, without opening a store or browser. Against the parent, that test
and the original registry comparison fail. After correction, all 15 focused
command-import and manual-login control checks pass with one worker:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 \
  js/tests/cli-help-imports.test.js js/tests/jobs-manual-login-controls.test.js
```

An initial local probe used an arbitrary string-valued flag, which is valid
input and reached browser launch. The installed test browser was unavailable;
the process exited. The final regression instead uses the parser's reserved
option rejection before any store or browser access. Both logs are preserved.

The [source and log archive](data/ci-login-admission.tar.gz) and
[hash manifest](data/ci-login-admission.tar.sha256.json) preserve the actual
hosted failures, both parent regressions, focused checks and static results.
Fresh exact-source hosted verification remains required. HH01 and the other
34 unfinished criteria remain required in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
