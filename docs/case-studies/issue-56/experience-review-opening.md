# Recover a CV editor request before native admission

On `359b79d0`, the review could record its exact editor input and stop before the native job accepted it. Recover review only checked for an existing native job. Status returned `cv-hh-workplace-missing` and the queue became unconfirmed despite having an editor request that could still be admitted.

```sh
node --test --test-concurrency=1 --test-name-pattern='admits an unopened editor' js/tests/cv-experience-review.test.js
```

When an interrupted queue is still at `opening` and has no recorded decision, it now uses the native service's idempotent Start with the saved request ID and options. The HeadHunter and LinkedIn native services use the same admission contract. A fresh request opens one editor. A stored request returns its existing receipt, including an interrupted or unconfirmed result. Recovery with a recorded decision reads status and leaves the decision pending confirmation.

The regression uses the native HeadHunter job to check an unopened request, an existing interrupted admission and a recorded decision whose native receipt is missing. The Chromium fixture recovers from the shared CV view and skips the newly admitted native draft with zero Saves.

[Focused tests](../../../js/tests/cv-experience-review.test.js) · [Logs](data/experience-review-opening.tar.gz) · [SHA-256 manifest](data/experience-review-opening.tar.sha256.json)

Authenticated recovery and recovery within incomplete profile acquisition remain open under HH17.
