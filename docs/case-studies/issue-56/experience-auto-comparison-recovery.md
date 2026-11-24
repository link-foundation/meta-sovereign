# Recover a completed comparison inside automatic CV preparation

On `40488fb8`, both snapshots and the completed comparison could survive a process interruption while automatic preparation still recorded `planning`. Automatic status returned the interrupted preparation, and parent review recovery refused the original request. The focused regressions simulate the interruption after the exact comparison is acknowledged.

```sh
node --test --test-concurrency=1 --test-name-pattern='original options after its comparison completed|exact automatic acquisition' js/tests/cv-experience-auto.test.js js/tests/cv-experience-review.test.js
```

An unowned preparation at that checkpoint now checks the deterministic comparison request for both stored snapshot revisions, direction, date and model options. The comparison must be complete and pass the existing receipt and translation checks. Status can return that exact result without writing the preparation, reading a provider or translating again. Missing work and mismatched options retain their original recovery states. The review's explicit recovery records the verified preparation before it opens the editor.

The tests verify direct and explicit-reference reviews, text and binary Lino, read-only storage status, mismatched options and stable read and translation counts. The Chromium fixture resumes the shared CV view after only the comparison reached completion and verifies the first native draft uses the original fingerprint.

[Focused tests](../../../js/tests/cv-experience-auto.test.js) · [Logs](data/experience-auto-comparison-recovery.tar.gz) · [SHA-256 manifest](data/experience-auto-comparison-recovery.tar.sha256.json)

Authenticated batch recovery and interruptions before an acquisition or the comparison has completed remain open under HH17.
