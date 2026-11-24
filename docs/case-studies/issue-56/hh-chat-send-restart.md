# HeadHunter send receipts after restart

At `4d0a2f5d`, a confirmed HeadHunter chat send used a process-local receipt with a ten-minute lifetime. After reopening the same Lino log, an exact retry performed a second provider dispatch. Both a positive native result and an uncertain outcome reproduced the duplicate attempt. A retry on a connected client can occur after the server restarts while the client still holds the original send ID.

The shared `/api/send` endpoint now reserves a HeadHunter send ID in the authoritative store after exact confirmation and flushes the Lino log before going to the provider. The record binds the draft fingerprint to the original conversation and client ID. Concurrent exact confirmations share the active operation. A retry of the same normalized draft after reopening recovers the confirmed outcome and the current saved message, and changing the draft under the same ID returns `send-id-conflict`.

An interrupted reservation or an ambiguous provider response returns `send-unknown` on retry. A definite refusal releases the reservation and permits a new confirmation. A failure to store a positive receipt preserves the original positive response and the reservation blocks a second dispatch. A failed reservation prevents dispatch. The journal stores a fingerprint, outcome and message IDs. The full message remains in ordinary Chat history. Flushing the authoritative text log allows the binary snapshot to continue on its normal schedule.

The pinned Telegram Web A client assigns a local identity before confirming delivery. The pinned Matrix client binds a transaction ID to the local outgoing event. The shared Composer and CLI likewise retain the original send ID. The server keeps its own evidence for HeadHunter browser interactions and uses the existing confirmation step. [Telegram Web A send](https://github.com/Ajaxy/telegram-tt/blob/f67a40879a7d78c2683ec5a296cf55bc22417d56/src/api/gramjs/methods/messages.ts#L375-L405) · [Matrix transaction identity](https://github.com/matrix-org/matrix-js-sdk/blob/d0e8162a6b2c10fe44f1a8a9a03354c28aad1488/src/client.ts#L2863-L2876).

## Reproduce and verify

Run the four bounded tests against an isolated disk-backed Lino store. They use default text and binary Lino over HTTP and replace the provider dispatch with a synthetic receipt.

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/hh-chat-send-restart.test.js
deno test --v8-flags=--max-old-space-size=384 --no-check -A js/tests/hh-chat-send-restart.test.js
E2E_EXECUTABLE_PATH=/opt/google/chrome/chrome node --max-old-space-size=384 experiments/issue-56/hh-send-restart-browser.mjs
```

The two baseline tests in the [archive](data/hh-chat-send-restart.tar.gz) show two dispatches at the same client ID after reopening the parent. The corrected server passes all four restart and failure tests plus the nine existing Automations and CLI regressions in each runtime. The shared Chromium import scenario exercises a captured native conversation and the actual Chat composer, read acknowledgement, both Lino formats and CLI. It records one provider send for an exact CLI retry and zero sends for an unconfirmed or changed request.

This verifies restart recovery in one authoritative workspace for HeadHunter sends with a stable client ID. Authenticated HeadHunter use, remaining web message actions and coordination across independent writable workspaces remain open under HH09 and HH11.
