# Question-link changeset admission

Published head `438f2bf4c223d6e5a13b2332a04b0a79317c7e68` failed Checks run [43654837536](https://github.com/link-foundation/meta-sovereign/actions/runs/43654837536). The exact-head metadata, complete workflow log and both failed job logs are preserved locally under `ci-logs/question-hidden-links-parent-hosted-*`.

The changeset job log `question-hidden-links-parent-hosted-check-for-changesets-132631192032.log`, lines 450–465, identifies the actual error: the PR adds both `review-new-question-links.md` and `visible-browser-defaults.md`, while the existing validator requires exactly one. Pipeline status merely propagates this failure; runtime and browser jobs were skipped. This run provides no runtime/browser validation.

The exact published head reproduces the failure with the production validator and explicit base/head SHAs; `ci-logs/question-hidden-links-changeset-before.log` retains the output. Move the complete link-review release note into the PR's existing minor changeset and remove the extra file. Keep the validator and release requirements unchanged. The same validator's local-directory mode then verifies the single consolidated release note, retained in `ci-logs/question-hidden-links-changeset-after.log`. No application code changes in this correction.

This correction restores CI admission. All original unfinished requirements remain active in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
