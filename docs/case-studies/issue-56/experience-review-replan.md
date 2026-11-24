# Recover the exact comparison after a verified CV Save

On `008fd8d0`, an interruption after a post-Save comparison finished could leave the queue at the replanning checkpoint. Recover review generated a second comparison request and used its receipt. The pending queue stored the refreshed CV revision while the comparison request ID existed only in the worker's memory.

```sh
node --test --test-concurrency=1 js/tests/cv-experience-review.test.js js/tests/cv-experience-plan.test.js
```

The reproduction restores a queue waiting for a new comparison and the already completed comparison result. The parent starts another plan. The fixed queue stores the child request ID before starting work. Recovery validates the recorded request ID, both immutable snapshots, directional options and the completed receipt. It adopts the original fingerprint and stores the provider's existing Save evidence. If the initial status read is unavailable, the same-ID Start can recover the existing result. A confirmed failed, stopped or interrupted comparison permits a new request on explicit recovery. Older checkpoints without a child ID bind a new request before starting the comparison.

The focused regression checks the completed comparison, an unavailable status response and a confirmed failed attempt. Separate tests cover exact native editor ownership, stale readback, history preservation, and both Lino encodings. The comparison uses only synthetic CV documents and never opens another provider editor or repeats the original Save in the reproduction.

Node and Deno each passed 11 checks. The Chromium regression passed with one owner Save, one provider editor and the queue recovery controls.

[Focused tests](../../../js/tests/cv-experience-review.test.js) · [Logs](data/experience-review-replan.tar.gz) · [SHA-256 manifest](data/experience-review-replan.tar.sha256.json)

Authenticated CV and wider batch recovery remain open under HH17.
