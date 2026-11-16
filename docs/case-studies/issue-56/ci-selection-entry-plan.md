# Trace the current hosted selection failure

Continue the complete issue objective in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

- [x] Preserve the exact failed SHA, workflow, job, raw log, artifact and native screenshot.
- [x] Inspect the failed state before proposing a cause: the exclusion field and saved settings are empty; the two decisions agree with those settings.
- [x] Review the field updater, component ownership and existing finite event-order probe. That probe passes and does not establish a hosted cause.
- [x] Extend the existing shared bounded input trace with focus, node identity, native length and rendered length; install it in the current and next document. Reuse it in selection and cache diagnostics without changing product behavior, assertions or deadlines.
- [x] Verify trace privacy/bounds and the existing résumé diagnostic with focused unit checks.
- [x] Run one owned WebKit selection case with tracing and retain its result as a negative reproduction; do not treat passing as a fix.
- [x] Preserve the initial failed exact-source CI attempt, investigate its log and archive the evidence. The repeated attempt remains independently reviewable; its result cannot establish the original cause.
- [ ] Publish evidence, retain all unfinished inventory criteria and verify the resulting exact-head CI.
