# Preserve the complete localized preset catalog

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Exact head `e386d58b` introduced the twelfth preset but left the server test's
expected count at eleven. Its English backend description also differed from
the existing English localization. The unchanged localization contract requires
an untouched preset to retain exactly the same fields in English.

Checks [43679930568](https://github.com/link-foundation/meta-sovereign/actions/runs/43679930568)
records both errors in Linux Node job `132708918177`, log lines 7330–7388.
The complete failing runtime job logs and timestamps are preserved. Four
companion workflows pass. Running these two existing test files on the actual
published source reproduces both failures, with twelve other checks passing:

```sh
node --test --test-concurrency=1 js/tests/automations-server.test.js js/tests/automations-view.test.js
```

The backend now uses the English catalog description. The endpoint test expects
twelve presets and verifies that the new engagement preset is disabled, uses
safe mode and retains the configured sticker. The existing all-preset English
identity check remains intact. Together with three separate sync-fixture
regressions, all seventeen focused Node and Deno cases pass. Full local suites
and runtime/browser matrices were not run.

The latest Windows Bun job `132708918116` fails only these two preset checks.
Its lines 8248–8279 show initial CLI readiness in 2,471 ms, including release
publication in 1,668 ms. The preceding head's much slower copy remains
unexplained; a faster later observation does not establish its root cause.
No readiness deadline or release-copy strategy changed here.

[Checked source and log archive](data/ci-preset-catalog.tar.gz) and
[manifest](data/ci-preset-catalog.tar.sha256.json) retain the exact parent,
reproduction, corrections and focused results. Corrected-head hosted checks
and all 78 unfinished original inventory criteria remain required.
