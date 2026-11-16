# CV experience browser diagnostic investigation

Keep all original requirements active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

- [x] Verify published SHA `b61cf5fd`, run `43879915890` and WebKit shard 3
      job `133345479581`. Preserve the complete raw job and browser artifact.
      Lines 1094–1105 reject same-origin access-control diagnostic messages
      after the experience comparison; no behavior assertion failed.
- [x] Read the complete loading, comparison and fixture helpers and existing
      shared engine/origin/native-name diagnostic policy. The CV helper drops
      Error.name and bypasses that policy.
- [x] Reproduce the actual published scenario with one bounded native-form
      diagnostic replay. Apply the existing policy to its owned context while
      retaining the standalone MCP collector and all behavioral assertions.
- [x] Run focused policy checks and one before/after browser comparison.
      Keep genuine exceptions, foreign origins and other engines as failures;
      do not change CORS, app behavior, scenarios or deadlines.
- [x] Apply the same policy to the four later independently owned experience
      inspections with the identical collector. Preserve their action callbacks
      and standalone behavior; require all mandatory scenarios in hosted CI.
- [x] Preserve exact-source `b558bd74` Chromium and WebKit shard 3 logs and
      metadata. All five experience inspections pass on each engine; the separate
      Deno import failure still prevents overall acceptance.
- [ ] Preserve checked source/log evidence, publish atomically and inspect
      all exact-head hosted jobs before acceptance. The nine candidate rows
      and every other unfinished requirement stay open.

The original job retained only error messages, so it does not itself prove
their Error.name. A native-form replay verifies the integration defect;
the corrected five-scenario hosted WebKit group now passes. Overall exact-head
workflow verification remains separately required.
