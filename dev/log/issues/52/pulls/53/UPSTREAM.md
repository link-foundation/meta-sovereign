# Related project reports

Confirmed shared defects are reported with an isolated reproduction, a workaround,
and a concrete code-level repair. Existing issues are extended instead of filing
duplicates. API bodies/comments are retained under `metadata/` in the archive.
None is a required sub-issue of issue 52; this PR implements the downstream repair.

| Project / report | Evidence and suggested repair |
| --- | --- |
| [JS template #270](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/270) | Newly reported. Both version scripts re-resolve a lockfile with legacy-peer-deps. Reproduction copies main's manifests into a temporary folder, bumps only the version with npm 12.2.1 and shows the removed peer entry. Workaround/fix: validate the existing v2/v3 lock root and update only its root versions; retain the strict tree guard and run root/nested × both-mode regressions. |
| [JS template #266](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/266#issuecomment-6488252354) | Existing false-green CodeQL issue. Added the actual 50-finding downstream SARIF/run and the local strict verdict implementation/tests. Synthetic SARIF reproduces the upload/pass distinction. Require valid reports and fail on unresolved findings without disabling queries; use a required code-scanning check only as a documented interim workaround. |
| [Python template #122](https://github.com/link-foundation/python-ai-driven-development-pipeline-template/issues/122#issuecomment-6488252603) | Existing equivalent CodeQL gate issue. Added downstream reproduction, workaround and source links; apply the same report-validation/verdict step to both scheduled and release paths. |
| [Rust template #221](https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/issues/221) | Newly reported after verifying no existing equivalent issue. Snapshot analyze/upload steps do not fail on findings. Includes synthetic and downstream actual reproductions, required-check workaround, SARIF gate suggestion and report/malformed/multilanguage regressions. |
| [actions/deploy-pages #413](https://github.com/actions/deploy-pages/issues/413#issuecomment-6487820731), [#434](https://github.com/actions/deploy-pages/issues/434) | Existing DEP0040 reports. Added Node 26.12.1/action v5.0.1 log reproduction, the narrowly scoped Node warning-code workaround, and the suggestion to update artifact/transitive dependencies and rebuild the bundled action. Latest release still contains punycode; this PR does not claim an upstream release exists. |
| [ietf-tools/red #577](https://github.com/ietf-tools/red/issues/577) | Newly reported intermittent RFC 8621 canonical self-redirect, after searching existing redirect reports. Includes the actual CI chain, bounded curl reproduction, later non-reproduction, direct HTML/text URL workaround and immutable worker source pointers. Suggests opt-in tracing, refusing/correcting cached same-URL redirects and canonical GET/HEAD chain tests. All four downstream translations use the verified direct HTML document. The responsible production layer is not claimed as proven. |
| [teleproto #53](https://github.com/sanyok12345/teleproto/issues/53) | Newly reported after checking existing localStorage issues. Root-package import eagerly initializes an unused StoreSession → store2 driver. Includes Node 26.12.1 trace, no-network import reproduction, feature-flag workaround and lazy-export/constructor-loading suggestions. Downstream lazy exports preserve all four original session classes, native globals and actual disk write/reopen behavior. |
| [store2 #131](https://github.com/nbubna/store/issues/131) | Newly reported getter-probe ownership layer after reviewing existing Node storage reports and current immutable source. Direct require reproduces the warning; an instrumented accessor gives a deterministic read count. Includes process-flag/deferred-loading workarounds and deferred/default-area or descriptor-check repair suggestions with browser/injected/custom-storage compatibility requirements. |

The deploy-pages flag is scoped to that action's step and one warning code, with
a regression proving other warnings remain visible. The managed Dependabot
OpenSSL bundle warning is expected upstream tooling behavior with successful
certificate refresh, not a confirmed bug warranting another duplicate issue.

Archived reports retain their original reproduction details and exact snapshots,
so the diagnoses remain reviewable after the upstream projects evolve.
