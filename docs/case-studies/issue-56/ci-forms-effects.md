# Shared guards for reviewed form effects

[PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) retains the same reviewed-action boundaries while removing repeated effect and fixture code.

The complete log for [Checks run 42862113702](https://github.com/link-foundation/meta-sovereign/actions/runs/42862113702), on `ebbcfbe7` at 17:10 UTC on 10 November 2026, reports successful ESLint and formatting checks (lines 1392–1406). Duplication fails at 6.51% against the existing 6.5% threshold (11418, 12655). The dependent browser and runtime jobs are skipped. The following `c6ad8846` run, [42862616182](https://github.com/link-foundation/meta-sovereign/actions/runs/42862616182), repeats that failure (12381, 13624). These are static-check failures; they provide no new browser result.

Choice disclosure and PDF attachment now use one guarded effect helper. It checks the privately bound targets and the full current inspection, checks ownership again, marks the effect issued immediately before interaction, verifies targets afterward, and disposes bindings on every path. Failures before issue remain refused; failures after issue remain uncertain. Each action retains its own actual readback verification and cached receipt, so response recovery never clicks or attaches a second time. The existing replacement and consumed-plan rules remain enforced.

Three focused HTTP fixtures now share isolated server setup and negotiated Lino requests. Three browser flows share response decoding, planning and desktop/mobile capture helpers. Their assertions and scenario-specific checks remain in their respective tests. The duplication gate and exclusions are unchanged. The local check reports 34,683 duplicated lines out of 534,102, or 6.49%, compared with the failing hosted 34,780 out of 534,122.

The earlier PDF commit also has a failed link run, [42862113783](https://github.com/link-foundation/meta-sovereign/actions/runs/42862113783), with transient GitHub HTTP 503 responses. After the separate concurrency mitigation, [42862614721](https://github.com/link-foundation/meta-sovereign/actions/runs/42862614721) passes: its log reports 1,857 examined links and zero errors (409–416). This confirms that hosted run, not a permanent resolution of remote service errors.

Twenty-eight focused checks pass in both Node and Deno. Strict changed-source lint passes. Production Chromium passes the isolated choices, PDF upload and custom-control flows, including stale-target refusal, actual readback and acknowledged cleanup. Commands use one test worker and a 384 MiB JavaScript heap; full runtime/browser matrices remain in CI.

Focused validation and preserved logs are in the [evidence archive](data/ci-forms-effects.tar.gz), with a [verified manifest](data/ci-forms-effects.tar.sha256.json). The next exact-head hosted matrix and all remaining form and issue-wide acceptance criteria remain required. This refactor does not complete accumulated pages, learning or optional models.
