# Native batch confirmation investigation

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft. The complete issue still has 32 unfinished criteria.

Exact-source Checks run 44234131384 at `e2acf88a7bdee8ba4df94015036b612463e7ebed` failed Chromium shard 1 in native batch confirmation. The preserved job log `hosted-e2acf88a-134567899964.log`, lines 1404–1410, reports `page.waitForFunction: Timeout 10000ms exceeded` at `application-panel-browser.mjs:78`, called from `e2e-application-batch.mjs:64`. The helper was waiting for the new receipt and renewed confirmation state. The batch still showed zero deliveries and vacancy 123. The native page-error list was empty.

The original catch printed only the batch subsection. It omitted the application panel's recovery/error state, and `APPLICATION_SCREENSHOTS` was unset, so the uploaded browser artifact had no batch screenshot. These facts do not establish why confirmation failed. In particular, contention with a background observation is a hypothesis, not a demonstrated cause.

The unchanged native scenario passes in one isolated local Chromium browser: two deliveries, one made manually, two deferred revisits, zero entry clicks, four locales, phone layout, no replay after reload, and drained resources. Its finite reproduction script is `experiments/issue-56/batch-confirmation-native.mjs`; the log and screenshots remain in the archived evidence. This local success does not replace hosted validation.

The fixture now defaults screenshots to the existing hosted `E2E_ARTIFACT_DIR` and prints the complete application panel on failure. Assertions, scenario registration, deadlines, production admission and delivery behavior remain unchanged. A recurrence will preserve the recovery state and screenshot required to investigate the actual cause. The timeout is not claimed fixed by this diagnostic change.

`data/ci-batch-confirmation.tar.gz` and its adjacent hash manifest preserve the failed job, source-bound run metadata, actual prior helper, current helper and local smoke evidence. Current-commit hosted checks must still pass, and all original unfinished requirements remain required.
