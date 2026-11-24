# Recover the target export after a verified CV Save

On `7b64abda`, Recover review always started another provider export if the process stopped between the original export and the queue's replanning checkpoint. To reproduce, restore a `refreshing` review with the confirmed About Save and a completed export for the same target. Both provider regressions observe an extra Start with a different request ID.

```sh
node --test --test-concurrency=1 --test-name-pattern='reuses a completed' js/tests/cv-experience-review.test.js
```

The queue now acknowledges the export request before starting it. When recovery finds the completed receipt, it checks the frozen request options, the provider identity, the new immutable revision and the saved fields. HeadHunter readback requires the exact résumé and browser slot. LinkedIn readback requires the original URL, language and native acquisition provenance. Once verified, the queue keeps the original revision and Save receipt and continues to comparison. The internal request ID stays private and is cleared at the next checkpoint.

The regression restores real acquisition-service receipts from isolated fixtures for both targets. Each recovery adopts the exact revision with zero new export starts. An unrelated request ID fails validation. The Lino regression covers both encodings and confirms that a stale readback preserves the Save until explicit recovery with a separate request. Node and Deno each passed 16 focused checks. The native Chromium regression passed with one owner Save and one provider editor.

[Focused tests](../../../js/tests/cv-experience-review.test.js) · [Logs](data/experience-review-refresh.tar.gz) · [SHA-256 manifest](data/experience-review-refresh.tar.sha256.json)

Authenticated provider and wider batch recovery remain open under HH17.
