# Employer-change refusal in hosted Chromium

1. Preserve current-head workflow timestamps/SHA and the failed Chromium shard
   log. Read its exact failure at `e2e-notice-policy.mjs:205` and trace the active
   history capture through `browserPaneIdentity` before native dispatch.
2. Isolate that existing employer-change scenario for one finite native local
   run. Reproduce the stale expected code on the actual production parent before
   correcting it. Keep zero sends, empty draft, failed outbox and drained owner
   assertions; do not accept generic refusal codes or extend deadlines.
3. Run that scenario and focused registration checks, preserve before/after logs,
   archive source evidence and publish the atomic correction. Review all hosted
   checks on the new exact head; no issue-wide criterion is accepted by this fix.
