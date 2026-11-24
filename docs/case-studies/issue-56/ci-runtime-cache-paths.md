# Runtime search fixtures and legacy cache paths

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft, with 86 verified criteria and 32 unfinished. This repair accepts no new criterion.

All five `e2acf88a7bdee8ba4df94015036b612463e7ebed` workflows started on 2026-11-18 at 03:58:58 UTC. Desktop, Pages, Links and Security succeeded. [Checks run 44234131384](https://github.com/link-foundation/meta-sovereign/actions/runs/44234131384) passed lint and reached the full runtime/browser matrices. Its raw failing-job logs and SHA/timestamp metadata are preserved in the evidence archive.

## Search fixture failures

The Node Windows shard 3 log (`ci-logs/hosted-e2acf88a-134567901113.log`, lines 4010–4020) reports `Use a valid HH vacancy search URL.` in the manual-login ownership test. The Bun Ubuntu log (`134567900902`, lines 5648–5671) identifies the same validation error in the shared-profile test. Other affected platforms reproduce these same two callers.

Both fixtures supply one vacancy URL to several different operations. The new owner-supplied search URL mode correctly validates that explicit URL as a search destination. It therefore refuses before the profile-launch or busy-admission assertion can run. Each fixture now supplies a valid native search URL for `search`, retaining its original vacancy URL for the other operations. Profile, ownership and provider-effect assertions are unchanged; production validation remains strict.

## Legacy import failures

Node Windows shard 2 (`134567900734`, lines 4211–4219) reports an absent migrated observation record. Deno macOS shard 6 (`134567901578`, lines 3447–3569) identifies the same empty migration in the original-file, refresh, failure-recovery, precedence and interface checks.

The bounded private-file reader compares each canonical parent directory against the configured base directory. The migration caller supplied a noncanonical base. A valid ancestor alias therefore appears to escape that base, causing an invalid-source refusal and an empty success cache. macOS temporary-path aliases and Windows short paths can expose this mismatch. The portable regression creates an actual directory ancestor alias and reproduces the empty import locally; no mocked filesystem result is needed.

Migration now resolves the validated directory before opening it, checking contained files and fingerprinting originals. A direct source-directory symlink/junction is still refused by the original `lstat` check. File symlink, size, encoding, identity and content validation remain intact. Original files and acknowledged current records remain untouched. Canonical aliases share one migration-original identity after restart.

Default-off `MS_JOBS_CACHE_DEBUG=1` diagnostics now identify read/decode/parse/directory refusal stages and error classes/codes. They do not print source paths, private filenames or content.

## Reproduction and verification

`python -B experiments/issue-56/runtime-cache-paths-before.py` selects the actual published source and original two fixture callers, then restores them in `finally`. Its three expected failures reproduce both search callers and the alias import. The direct linked-directory refusal remains a passing control.

The corrected focused Node run passes all 45 checks across both search/profile fixtures, the two path regressions and the existing migration/history checks. The focused Deno run passes 23 checks. Runs use bounded inputs and one Node worker. Existing race, refused persistence, causal deletion, exact original bytes, CLI and both Lino interface assertions remain present. Scoped lint, formatting, line limits and the unchanged duplication gate are required before publication.

The independent browser batch timeout in job 134567899964 remains a separate investigation. This repair neither extends its deadline nor treats it as passing. Exact-source hosted validation remains required after publication.
