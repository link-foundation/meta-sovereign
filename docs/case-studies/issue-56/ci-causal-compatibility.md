# Causal storage and existing publication workflows

Draft: <https://github.com/link-foundation/meta-sovereign/pull/57>.

The completed Checks run [43471579777](https://github.com/link-foundation/meta-sovereign/actions/runs/43471579777), created at 2026-11-13 17:19:02 UTC for `4bfeaf2c57662194d6389e9289625e0ca08da34b`, exposes eight shared failures after the production causal-storage changes. Linux Node job `132046618474` reports the complete failures at raw log lines 6526–6656. The runtime/OS jobs repeat the same failures or their shard subsets. Windows Bun additionally fails initial rolling-server readiness at lines 7058–7093; that separate failure remains under investigation.

The eight shared failures reproduce locally on published `2fbdc4b2` using only the affected test names, concurrency one and a 384 MB JavaScript heap. The preserved `causal-compat-parent.log` contains eight failures and no passes.

## Root causes and correction

Saved publication destinations now contain causal `vc` fields and can acquire `__msSyncStamp` after a concurrent replicated assignment. Passing those internal fields to the strict destination input validator rejects valid saved routes before preview (HTTP 400 instead of the required confirmation response). The stale-preview check has the same problem.

Trusted storage reads now discard only those two synchronization fields before validating destination business fields. Lists return editable destinations without internal clocks, preserving version, timestamps and tokens. Owner-supplied clocks, stamps, credentials and other unknown fields remain rejected. Destination versions, routing comparisons, credential checks and single-use confirmation remain enforced. A new four-case regression covers explicit/all-enabled selection, list/edit round-trip, an actual concurrent peer assignment and strict owner/unknown-field validation. Three cases fail against the exact published target reader; the strict validation case already passes.

Six existing fixtures also assumed the earlier storage shape:

- Inject the disk-write failure at the service's actual wrapped storage boundary; assert the injection occurred once, the confirmed network send stays sent, and retry neither resends nor retries persistence.
- Check expired cache absence through the public store, and separately verify that underlying retained deletion metadata contains no erased payload and has a positive causal clock.
- Verify CLI export and HTTP link listing include the current schema marker as well as the expected owner record; retain the imported message-body check.
- Verify backup restore preserves every business-record ID and deliberately omits the source schema marker, because the destination owns migration.
- Compare the binary mirror with the raw synchronization-record scan, including payload-free deletion clocks, while independently asserting public reads hide deletion markers.

No production visibility, deletion, schema, input-validation or confirmation guarantee is weakened to satisfy a legacy assertion.

## Focused verification and evidence

Run the parent destination reproduction with `python3 -B experiments/issue-56/causal-compat-before.py`. It temporarily restores only the exact published target reader, runs four small tests and restores the working source in `finally`. It records three failures. The initial draft used a dominating clock that correctly needed no separate winning-write stamp; the final fixture uses a concurrent clock to exercise that metadata. Both initial and corrected parent logs are preserved.

The final affected-name check passes 12 tests: the eight hosted failures plus four destination regressions. A separate publication compatibility check passes 12 tests, including CLI lifecycle, text/binary Lino outcomes, credential redaction and stale routing/credential refusal. These groups overlap. An initial draft asserted a chat-qualified Telegram import ID; the actual established importer ID is `msg:telegram:5`, and the corrected assertion preserves that contract. Both logs are retained.

Strict changed-file ESLint, scoped formatting, Secretlint, the pending release changeset and the rebuilt web bundle are checked. The initial ESLint run correctly rejects a test describe block exceeding its line budget; the final assertion arrangement retains all checks within the existing limit. Full runtime/browser matrices remain hosted. This unit makes no visual changes or external provider writes.

The verified archive [data/causal-compatibility.tar.gz](data/causal-compatibility.tar.gz) contains parent/current sources, focused logs, exact run/job metadata, complete parent workflow/job logs and numbered failure excerpts. Its [hash manifest](data/causal-compatibility.tar.sha256.json) permits independent integrity checking. The collector checks the expected parent/final results before archiving.

Published `2fbdc4b2` adds bounded initial/reconnect synchronization, with separate [native and durable evidence](sync-reconciliation.md). This compatibility correction still requires exact new-head hosted verification. The Windows Bun initial-start failure, native synchronization parity, multi-tab storage ownership, full reference-feature parity and every unchecked original issue criterion remain unfinished. Keep PR 57 draft and unmerged.
