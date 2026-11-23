# Complete desktop configuration contract audit

PR: https://github.com/link-foundation/meta-sovereign/pull/57

This maps unfinished **VD07** to all seven Configuration And Storage clauses in
the pinned [desktop requirements](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/docs/REQUIREMENTS.md),
its [layered store](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/src/lino-store.js)
and the entire [bot configuration](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/src/bot/config.js).
The sources, configuration tests and selector were read before this mapping.
Their Git blob hashes and pinned URLs must accompany hosted acceptance.

## Configuration And Storage clauses 1–7

| Pinned clause                                                                            | Shared implementation                                                                                                                                                                                                                                                                                                                                 | Verification                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Links Notation configuration, state and cache; no JSON files or required type markers | `readReadableConfiguration` parses bounded ordinary indented Lino. Global/local `config.lino` and `runner.lino` require no tagged values. Native durable records and caches use the existing text/binary Lino stores and their acknowledged writes. Transport compatibility formats do not change the durable configuration format.                   | Actual startup/desktop dispatch reads readable files; runner editing parses the acknowledged file; legacy catalogs survive text and binary flush/reopen; actual saved configured friend settings reopen unchanged.                                                                                                               |
| 2. Local app-folder configuration overrides global user configuration                    | `startupArguments` validates each global and local layer before merging, then applies explicit CLI options. The same loader feeds `serve`, Electron and public policy commands. Automation fields merge per policy; lists replace. `readRunnerConfiguration` supplies the corresponding runner target precedence and revision-checked local editor.   | Hidden invalid globals refuse even when overridden. Selected missing, oversized, nonregular and malformed files refuse without private values. Six-policy reads, actual CLI/server dispatch, desktop consumption, local editing and unchanged global bytes are asserted.                                                         |
| 3. State/cache belongs to the application directory where appropriate                    | `defaultStoreDir` selects the OS user's private application store; explicit store selection wins. `resolveUserStore` migrates a legacy working-directory store once, preserves media/certificates and refuses two-store conflicts. Native provider state/cache uses the selected shared store.                                                        | Three-platform path selection, actual migration, two reopen cycles, retained messages/credentials/media/TLS identity and conflict refusal; legacy policy and configured friend durable restart checks.                                                                                                                           |
| 4. Use lino-arguments for CLI options                                                    | `lino-args.js` uses the installed package's exported `yargs` parser with explicit compatibility options. Domain commands retain validation; end-of-options and reserved parser keys are handled before dispatch.                                                                                                                                      | Four parser regressions require exact types/spelling/last-value precedence, literal flag-shaped positional data, private generic refusals and invocation isolation. Existing runner and six policy CLI tests exercise actual consumers.                                                                                          |
| 5. Redact tokens, passwords, cookies and related credentials                             | `redact.js` is shared by aggregate/session logs and stored error summaries. Generic configuration refusals omit supplied contents and private paths. New VK authorization/import requires confirmed protected storage, validates the user identity and awaits a private encrypted secret write. Public receipts are masked and sync excludes secrets. | Log tests inspect complete emitted lines/files and retained stacks; acquisition/API tests check protected-storage refusal, ciphertext, masked receipts, account mismatch, failed acknowledgement rollback and cancellation drainage. Secret-store tests inspect actual on-disk Lino, wrong-key refusal and both sync directions. |
| 6. Verbose logs by default                                                               | `withLoggedSession` and shared diagnostics settings default verbose on; explicit CLI/environment/saved owner choices can turn it off. Every owned disk runtime retains its independent redacted session through startup or close failure. Caller-owned memory fixtures retain their own sink.                                                         | Actual startup failure leaves its private log; acknowledged settings survive restart; both Lino encodings and the shared UI save/reload the preference, download the complete owned log, retain refused drafts and avoid replay.                                                                                                 |
| 7. Normalize empty, scalar and legacy bare-key list values before merging defaults       | Native priority/catalog readers normalize persisted legacy values without rewriting owner records. File defaults reuse those readers and validators at every layer. New owner writes remain strict; malformed objects and invalid destination/catalog domains still refuse.                                                                           | Empty object/null/empty-string and scalar/list cases cover priorities, communities, messages, attachments, stickers and greetings. Tests assert owner false/zero values, no read-time writes, actual Lino reopen and protected reviewed birthday delivery.                                                                       |

The application has no JSON configuration/state/cache file requirement. The
encrypted secret payload uses the existing authenticated cipher envelope inside
a Lino record; it is not a claim that internal encoding never uses JSON. Browser
SDK control metadata and OAuth provider messages remain dependency protocols.
Existing legacy plaintext secret records are preserved rather than silently
rewritten. Protected VK acquisition refuses if encryption is unavailable; the
guide identifies `MS_SECRET_PASSPHRASE` and keeps it outside ordinary defaults.

## Complete bot configuration mapping

| Pinned configuration                                                         | Native configuration and retained behavior                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vk.token`                                                                   | Protected canonical `secret:vk:user-token`, with validated import/authorization and masked shared receipts. Older credential keys retain compatibility. Tokens cannot enter ordinary automation defaults or a runner profile.                                                                                                                              |
| `verbose`                                                                    | Shared server/desktop startup flag and acknowledged diagnostics preference, with default-on session logs and explicit opt-out.                                                                                                                                                                                                                             |
| Six independent feature switches                                             | `automations.vk.online`, `friends`, `cleanup`, `outgoing`, `wall` and `birthday` each expose `enabled`; explicit owner pauses override file defaults and survive restart. The native safe initial state pauses provider mutations until the owner enables them.                                                                                            |
| Six intervals                                                                | Each policy uses `everyMinutes`. Defaults are 14, 20, 30, 8, 9 and 1380 respectively; the reference's 23 birthday hours are 1380 minutes. Global/local file changes and explicit policy flags use native validation.                                                                                                                                       |
| `maxFriends`, `topPercentMutuals`, friend batch and outgoing deletion limits | Friend `maxFriends`, optional `topPercentMutuals` and `batchSize`; outgoing `limit`. The added `desktop-configured` mode enforces actual capacity and the configured lifetime percentage. Ranked batches and the earlier mutual-threshold policy remain available. Default percentage is ten; finite fractions and zero are supported.                     |
| `priorityFriendIds`                                                          | Friend/maintenance priority IDs, account-bound complete outgoing-list seeding and acknowledged clearing. Native protections, explicit person consent and owner choices remain in place; reading configuration never sends a priority request.                                                                                                              |
| Invitation text, ten variants and communities                                | Wall `messages` and `communities`, shared default catalog, explicit restoration and reviewed frozen random choice. The reference's single text maps to a one-line native catalog; native multiline/list compatibility preserves every authored variant. External community IDs are owner choices; opening configuration does not enroll real destinations. |
| Ten birthday greetings                                                       | Birthday `messages`, shared defaults, explicit restoration and reviewed frozen choice. Existing owner catalogs remain intact.                                                                                                                                                                                                                              |

The [configuration guide](../../SERVER-CONFIGURATION.md), its Russian, Hindi and
Chinese versions and the [paused readable example](../../../examples/desktop-automation-config.lino)
document native field names and precedence. Explicit inline `--automation-defaults`
overrides files; saved owner fields then win. Policy CLI flags save explicit
acknowledged owner choices. Removing file defaults restores built-in values
where no owner record exists, including rolling workers without stale defaults.
Reading or saving configuration does not imply a successful provider action.

The new [configured-friend case](vk-configured.md) closes the measured hardcoded
percentage/capacity gap: ten exact-parent failures, fifteen focused passes,
forty-three combined checks and native/MCP recovery with all fixtures drained.
Earlier [startup](startup-configuration.md), [desktop](desktop-configuration.md),
[runner layering](runner-configuration.md), [file defaults](automation-defaults.md),
[legacy lists](legacy-catalogs.md), [logging](runner-log.md) and
[protected token](vk-token.md) evidence retain their original reproduction and
historical pending-state limits.

## Remaining exact-source gate

`desktop-configuration-evidence.json` selects nineteen immutable evidence units.
The finite integrity audit hashes every entry without extraction and compares
the archived production sources with the selected commit. Every changed source
delta must be reviewed; a matching archive hash alone establishes no behavior.

Acceptance additionally requires five successful workflows on one exact source,
the complete selected named tests in the actual successful Node log, required
native configuration/log/default/legacy/token browser receipts in Chromium and
WebKit, protected native Electron authorization and current packaged-runtime
verification. Synthetic accounts establish configuration behavior, without
claiming live VK delivery. The collector must reject missing, duplicate,
skipped, failed or contradictory selected evidence.

The `b3364503` comparison contains 73 changed-source pairs across 41 files. The
complete 5,407-line comparison was reviewed in bounded sections, with repeated
CLI help changes deduplicated for the remaining review. Later changes retain
layer-by-layer validation, explicit owner overrides, ordinary Lino defaults,
protected token acknowledgement and redacted independent session logs. The
review also covers configured friend quotas, legacy catalog normalization,
localized retained drafts, appearance defaults and owned desktop shutdown.
Its hash-bound review receipt records this source review separately from hosted
behavioral acceptance; no green workflow is inferred from the comparison.

The bounded readers are reproducible without running a local test matrix:

```sh
python3 -B experiments/issue-56/audit-hosted-criteria.py b3364503 --names-file experiments/issue-56/desktop-configuration-evidence.json --output-prefix desktop-configuration-criteria
python3 -B experiments/issue-56/collect-desktop-config-criteria-hosted.py b3364503 b3364503
```

The second command requires the complete successful workflow metadata and
selected full job logs under `ci-logs/hosted-verification-b3364503-*.json` and
`ci-logs/hosted-b3364503-*.log`. Pending workflows must refuse collection.

The collector reads the native partition count, complete shard list, both
engines, job names and unique registry from the selected source commit. It
supports the historical four-shard and corrected eight-shard layouts without
relabeling old receipts. The finite regression reader checks both actual Git
sources and refuses five contradictory/missing layouts:

```sh
python3 -B experiments/issue-56/check-hosted-browser-layout.py
```

The current `72dc9552` audit independently rehashes all 1,137 entries. Every
archive map and selected production source hash is identical to the complete
`b3364503` review; every comparison line is identical after replacing only the
Git revision in its headers. The finite rebinding reader verifies the original
audit/diff hashes and refuses changed source bytes. It preserves the original
review identity separately; the hosted collector retains and checks that chain.
Both original/current audit and review receipts, the complete comparisons and
the pending-workflow refusal are retained in the [rebinding archive](data/desktop-config-review-rebind.tar.gz)
and its [manifest](data/desktop-config-review-rebind.tar.sha256.json). This makes
the audit inputs recoverable without reconstructing local progress notes.

```sh
python3 -B experiments/issue-56/audit-hosted-criteria.py 72dc9552 --names-file experiments/issue-56/desktop-configuration-evidence.json --output-prefix desktop-configuration-criteria
python3 -B experiments/issue-56/rebind-desktop-config-review.py
python3 -B experiments/issue-56/collect-desktop-config-criteria-hosted.py 72dc9552 72dc9552
```

The final command requires all five complete successful workflow metadata files
under `ci-logs/hosted-verification-72dc9552-*.json` and their selected full job
logs under `ci-logs/hosted-72dc9552-*.log`. Pending results still refuse acceptance.

The later `ef34179a` audit independently rehashes the same 1,137 entries. Compared
with the original complete review, only two audited production files differ.
The complete 22-line incremental comparison was read: CLI help documents the
separate vacancy preview; server construction passes its selected store directly
to the shared sender. The latter uses that same store for acknowledged consent
after connection loading, without changing configuration precedence, credential
handling or log ownership. Both consumers and the existing Stop regressions
were inspected. The current comparison contains 75 changed-source pairs across
41 files, including the original review's unchanged pairs.

This is an explicit incremental review, rather than an unchanged-source rebind.
Its reader verifies the original three baseline files, archive/source membership,
all archived hashes, both current source hashes and the actual Git comparison.
Seven finite contradictory-input probes refuse missing sources, altered current
or archived hashes, a substituted baseline review/revision, altered archive
integrity and an altered delta hash. No test matrix runs locally. The complete
[review chain](data/desktop-config-incremental-review.tar.gz) and its
[manifest](data/desktop-config-incremental-review.tar.sha256.json) preserve both
reviews and their comparisons separately from hosted behavioral acceptance.

```sh
python3 -B experiments/issue-56/audit-hosted-criteria.py ef34179a --names-file experiments/issue-56/desktop-configuration-evidence.json --output-prefix desktop-configuration-criteria
python3 -B experiments/issue-56/extend-desktop-config-review.py ef34179a --reviewed-path js/src/cli/help.js --reviewed-path js/src/server/index.js
python3 -B experiments/issue-56/check-desktop-config-incremental-review.py
python3 -B experiments/issue-56/collect-desktop-config-criteria-hosted.py ef34179a ef34179a
```

The last command still requires five complete successful exact-source workflows,
the selected named tests and actual browser/native/packaged receipts. It cannot
accept pending results or establish behavior from source integrity alone.

## Review through `84ca6588`

The selected source audit rehashed 1,137 entries across 19 archives and
compared 99 distinct production paths. The complete 2,343-line delta from
`b3364503` changes 24 audited files. Among the changes are desktop runtime and
notification ownership, shared CLI dispatch, local/cloud admission, connection
and settings views, and runner launcher preparation on explicit Start. The
review confirmed that the same layers resolve in order, private defaults and
protected local VK writes retain their acknowledgement, and the local runtime
still owns its redacted logs and shutdown. The LinkedIn About addition in
`84ca6588` leaves the selected configuration sources identical to the reviewed
`853faeb2` hashes.

The [updated source archive](data/desktop-config-review-84ca6588.tar.gz) and
its [hash manifest](data/desktop-config-review-84ca6588.tar.sha256.json) preserve
91 changed-source pairs, the earlier review, exact Git deltas and seven
contradictory-input refusals. This supports source review. Hosted acceptance
requires the named Node checks, configuration, logs and token browser receipts
in both engines, the Electron authorization receipt, and the five packaged
runner lanes on one revision.

The five workflows for `84ca6588` were pending at this review. VD07 remains unfinished and the
inventory remains **88 verified / 30 unfinished**. PR57 stays draft and
unmerged. [Hosted checks](https://github.com/link-foundation/meta-sovereign/pull/57/checks)

## Runner configuration through `2810a508`

The new 24-file source comparison still has 91 changed-source pairs. The
runner controller is the sole audited path with a different hash from
`84ca6588`. The revised controller passes its existing validated target through
runtime preparation and uses a cached runtime for read-only application health.
The configuration layers, retained session address, lease, status and Stop use
their existing paths. Node and Deno both verify these behaviors, and the source
audit again rejects all seven inconsistent inputs. Hosted acceptance remains
pending. [Runner verification](runner-launcher-preparation.md)
