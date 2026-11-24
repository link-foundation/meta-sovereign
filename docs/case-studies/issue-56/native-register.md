# Deterministic typed Rust register

Draft: <https://github.com/link-foundation/meta-sovereign/pull/57>.

The typed native core on published `8b1c19bad88061055a4c8657f771c947bcdcdd46` retains the older merge rules. Equal clocks select the left argument, concurrent winners inherit joined observations as if they were assignment clocks, child IDs are returned in randomized hash iteration order, and explicit zero counters remain in merged vectors. These are independent convergence failures. The existing JavaScript correction does not change the separate native implementation.

## Reproduction and correction

Run `python3 -B experiments/issue-56/native-register-check.py --before`. This compiles the exact published std-only core and four small unchanged-API cases, sequentially, in a temporary experiment directory. All four fail. The three-write example produces B for `(A merge B) merge C` and C for `A merge (B merge C)`, despite both outputs claiming the same joined vector. Equal-clock A/Z changes with argument order. The raw failing values and compiler resource measurements are preserved.

The typed `Link` now retains an optional original winning assignment and its observed context, plus an optional string version. Its merge follows the same product as the JavaScript implementation: maximum immutable write rank, joined observations and a canonical grow-only child set. A later tick beyond a retained context starts a new assignment. Invalid contexts and different IDs reject through `try_merge`; inputs remain unchanged. Existing trusted-call entry points remain available, with corresponding fallible clock helpers for untrusted admission.

Counters are normalized to the JavaScript safe-integer range, explicit zeros disappear, empty tick actors and exhausted counters reject, and sums use `u128`. Rank comparison uses the original clock, exact decimal version comparison without bounded integer parsing, and the JavaScript type-tagged key for this typed payload shape. The internal key does not change a wire protocol.

Cross-language string comparison needs more than Rust's ordinary string ordering. The native comparator follows UTF-16 code units, and the canonical clock key enumerates numeric array-index actor names first. These choices follow the [ECMAScript string comparison algorithm](https://tc39.es/ecma262/#sec-islessthan) and [own-property ordering](https://tc39.es/ecma262/#sec-ordinaryownpropertykeys). Tests include supplementary/private-use Unicode, numeric actor names, escaped/control-character tokens and Unicode children.

## Focused verification

`node experiments/issue-56/native-register-vectors.mjs` derives thirteen permanent Rust fixtures from the actual production JavaScript merge. Each checks all six three-record delivery orders, both groupings, duplicate delivery and self-merge. Cases include retained assignment metadata, a new owner tick, maximum safe counters and large decimal versions. `--check` refuses fixture drift and is added to the existing hosted native interoperability step; Cargo discovers both integration test files normally.

`python3 -B experiments/issue-56/native-register-check.py` passes eight hand-written regression/validation cases and thirteen generated reference cases. `--clippy` checks only this core and these targets with warnings denied. Rustfmt, scoped JavaScript lint/formatting, secret scanning and the existing release changeset are checked separately. The local compiler is `rustc 1.99.0`; the repository's full workspace job retains its pinned `1.99.1` toolchain. No toolchain or dependency installation, full workspace build, local runtime/browser matrix or stress probe is used.

The final focused compilation peaks at 171,688 KiB; focused Clippy peaks at 187,752 KiB. The probes compile sequentially without debug information and remove temporary artifacts. Individual test binaries finish in at most 0.02 seconds in the preserved run. These figures describe this finite check, not general capacity limits.

The [source and raw evidence archive](data/native-register.tar.gz) includes exact-parent source, regression output, generated fixtures, compiler measurements and hosted metadata. Its [hash manifest](data/native-register.tar.sha256.json) verifies every archived byte.

## Scope that remains unfinished

This correction covers the typed core's id, string tokens, children, vector and optional string-version shape. It does not implement the native server's arbitrary structured-record merge/admission, durable causal metadata in `LinoTextStore`, deletion history, schema negotiation, initial reconciliation or live relaying. The native HTTP state currently stores rich records separately, and the native sync inbox is not a complete replicated store. Those paths need their own implementation and end-to-end evidence; passing these typed fixtures cannot establish native server parity.

Automatic editable-tab merging, shared cache ownership and every other unchecked original issue criterion also remain active. The browser safeguard's published `8b1c19ba` CI run `43481124739`, created at 2026-11-13 18:17:06 UTC, exposes a separate Linux/Windows Bun fixture failure: fake localStorage lacks required Web Locks. The [focused fixture correction](ci-browser-account-locks.md) is published as `c0fc2d23`; its hosted checks remain unfinished. Earlier `eefc6f7d` runtime jobs passed, but three browser shards were cancelled by the superseding publication. Exact final-head hosted checks remain required, and the PR stays draft and unmerged.
