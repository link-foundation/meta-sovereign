# Wait for source-bound consent to render

Two exact published Chromium jobs fail the native-export publication scenario
at `e2e-cv-publication-exports.mjs:53`, reading `true` where cleared consent is
required:

- Commit `745766488c2c1c6e1773546d9d0a4175a8b28aa0`, Checks
  [43649013601](https://github.com/link-foundation/meta-sovereign/actions/runs/43649013601),
  created 2026-11-14T22:36:51Z; job `132613956011`, lines 1472–1507.
- Commit `b3d4cf77ffe012ab7ae6e3b8de38799bbceaec41`, Checks
  [43650485324](https://github.com/link-foundation/meta-sovereign/actions/runs/43650485324),
  created 2026-11-14T22:54:10Z; job `132618517444`, lines 1458–1498.

The test selected the owner-save source and immediately sampled the checkbox.
The source picker sets React state, and the panel clears consent in an effect
after the selected source renders. The code and failure location indicate a
render race: dispatching the select event does not establish that the effect
has committed. The panel separately requires the exact reviewed source before
publication; that guard remains unchanged.

The fixture now waits for the visible, unchecked consent control after each
source change, then retains its exact unchecked and disabled-publication
assertions. It still explicitly confirms the restored native source before
the local push. There is no fixed sleep, increased deadline or production
change.

Reproduce with `RUN_BROWSER_E2E=1`, an available `E2E_EXECUTABLE_PATH`, and
`node js/tests/e2e-cv-publication-browser.mjs`. The unchanged parent passes
locally, which is retained rather than presented as a local reproduction.
The corrected focused group also passes: two owner-save pushes, one native
export push, four locales, protected private/index data and read-only recovery
without replay. These use owned working/bare Git repositories and no provider
sessions; fixtures and browser close before exit. Scoped strict lint,
formatting and diff checks pass. An initial lint invocation omitted the
repository configuration; that failed invocation and the corrected check are
both retained.

The earlier full-log download for `43649013601` reports a missing log for
cancelled job `132613956580`; its partial workflow log is preserved alongside
the complete failing browser job. Other failures and the current head's hosted
matrix remain separate requirements. This correction does not certify issue
#56 completion; [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
remains draft and unmerged.

The [checked archive](data/cv-publication-consent.tar.gz) and
[SHA-256 manifest](data/cv-publication-consent.tar.sha256.json) preserve the
exact source before/after, both downloaded failing browser logs, job metadata
and successful focused local verification.
