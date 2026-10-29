# Findings, causes and solution choices

## 1. Published npm version followed by GitHub release failure

Both normal and instant release modes pass `TARGET_COMMITISH=HEAD` and `COMMIT_SHA=HEAD` after versioning. `create-github-release.mjs` forwarded that local symbol directly to the remote API. The [GitHub release API](https://docs.github.com/en/rest/releases/releases#create-a-release) accepts a branch name or commit SHA; a local worktree's `HEAD` does not identify the newly pushed remote commit. HTTP 422 is a permanent input error, so retrying it or increasing timeouts cannot repair it.

Plan applied: resolve the requested local ref with `git rev-parse --verify REF^{commit}` at the moment of creation/enrichment, validate a full commit hash, and share this operation across both helpers/modes. The offline CLI fixture captures the actual POST payload and compares it with a real temporary Git repository's version commit. Before: HTTP-equivalent fixture gets `HEAD`; after: the exact SHA. Preserve the existing strict release probe and idempotency on an existing release.

Alternatives considered: passing `github.sha` points to the pre-version source, while hard-coding `main` introduces a moving-target race. `gh release create --target FULL_SHA` is an existing supported CLI alternative, but replacing the entire established JSON-input flow adds no safety over resolving the current target. Do not mutate historical releases from a development PR or republish npm 1.0.0. Existing registry visibility/recovery permits GitHub-only repair after merge without a duplicate upload.

## 2. False successful formatting after refused lookups

The wrapper caught every `gh` failure and returned zero as though the release simply did not exist. The note formatter also swallowed PR lookup failures, wrote an incomplete body and added the badge used as its completion marker. A future retry could then skip the missing metadata permanently.

Plan applied: reuse `probeGitHubRelease` to distinguish a valid release, explicit absence and unknown/refused states. A required missing release fails formatting; 401/403/429/5xx and malformed responses fail before mutation. Validate PR arrays and propagate lookup errors; only a successful empty array means no related PR. Existing source debug switches are sufficient; the root cause is reproduced without adding redundant logging or exposing credentials. Upstream JavaScript report #271 contains the actual offline 403 reproduction.

## 3. Changelog extraction loses or substitutes content

The old interpolated regex treated dots as wildcards, accepted version prefixes such as 1.2.30 for 1.2.3, and ended at the first heading of any depth. Thus a multi-section changeset could lose most of its notes. A later audit found that even an exact heading scanner must ignore version-shaped headings inside fenced examples.

Plan applied: exact version heading comparison, preserve all lower-level headings, stop at the next real level-two heading, and track backtick/tilde fences. A missing version is an error rather than generic success. Regressions exercise CRLF, prefix collisions, regex metacharacters, empty entries, multiple sections, both fence kinds and a requested version that occurs only inside a fence. JavaScript/Python template parsers were executed against the same fenced example and truncate it; the equivalent Rust scanner has the same source-level boundary error. All three received reports with workarounds and code suggestions.

The same fence scanner is shared by commit metadata extraction. Otherwise a code example such as `- deadbeef: example` would become an API lookup, produce a real 404, and block formatting of valid notes. A failing-before CLI regression demonstrates that failure; fenced and indented examples are now preserved without being treated as commits.

Alternative: [mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown) provides a maintained CommonMark AST and source positions. A general changelog editor should use such a parser. This helper reads the project's standard Changesets level-two version format and needs a small bounded scanner; adding an AST dependency to release bootstrap is unnecessary for the reproduced cases. This is not a promise to parse arbitrary Markdown release conventions.

## 4. Formatter corrupts already-decoded Markdown

The API response is JSON-decoded before formatting. Replacing literal `\\n`, deleting quotes/indentation and splitting on `---` modified code examples, Windows paths and later changesets. The defect is deterministic and independent of GitHub availability.

Plan applied: preserve the original body verbatim and append related-PR metadata/badge using JSON stdin. Extract all unique changelog commit hashes and retain every related non-version PR, rather than selecting the first one. Paginate and validate every response page so results beyond GitHub's first 30 entries are retained too. Regressions compare exact Markdown prefixes, literal escapes, quotation marks, horizontal rules, multiple PRs and a second response page. Current upstream JavaScript already contains some body-preservation/all-PR improvements; those are reused as policy, not reported as newly undiscovered upstream bugs.

## 5. Large notes fail or lose their completion marker

Unbounded release bodies can exceed API limits, while truncating after adding a badge can drop the idempotency marker. Character slicing can split a Unicode surrogate pair.

Plan applied: a conservative 60,000-byte UTF-8 budget, code-point iteration, immutable tag-specific link to the complete changelog, and metadata space reserved before shortening the body. A finite 16,000-emoji fixture checks the actual PATCH payload, byte limit, full-notes link and retained badge. No stack/memory stress is necessary.

## 6. Concurrent cache reservation warnings

Recent `setup-node` automatically enables caching when the manifest identifies npm. Several parallel jobs shared the same OS/architecture/lockfile key and all tried to save it. The same lockfile in separate workflows added contention. These are cache ownership collisions, not package-install failures.

Plan applied throughout maintained workflows: explicitly disable implicit package-manager caching on every setup-node step; use a shared composite action with workflow/ref/OS/architecture/lockfile identity. Consumers use `actions/cache/restore`; designated writer jobs alone use save-capable `actions/cache`. Linux lint and Windows/macOS Node jobs own the Checks keys; Pages owns its separate workflow key. Branch identity prevents separate PRs racing for the same reservation. Bun/Deno do not restore an npm download cache. Privileged publication/preflight jobs retain no dependency cache. Failing-before policy regressions cover every setup-node occurrence and cross-ref isolation, and existing writer/concurrency contracts remain required.

Alternatives: merely changing the key per job wastes duplicate caches; suppressing reservation messages hides ownership errors; serializing the whole runtime matrix needlessly slows checks. [setup-node](https://github.com/actions/setup-node) documents implicit cache behavior and [cache/restore](https://github.com/actions/cache/blob/main/restore/README.md) supplies the existing restore-only component.

## 7. Notices, external warnings and apparent false results

| Signal | Evidence and disposition |
| --- | --- |
| Desktop workflow success, no installers | Resolver notice plus skipped downstream jobs accurately records a blocked publication. Preserve the strict terminal release gate; never relabel skipped installers as successful builds. |
| npm visibility retries | Staged publication later becomes visible in the original run; preserve bounded classified recovery, not another upload. |
| macOS ARM capacity notices | GitHub allocation constraints are external. Existing native Intel lanes and retained ARM Bun/Deno/desktop coverage must remain. A queued job never counts as a pass. |
| Dependabot `ubuntu-latest` migration notice | GitHub-managed updater runner selection; repository-owned workflow images remain explicitly selected. No repository workflow can alter the updater's runner image. |
| OpenSSL `ca-certificates.crt` rehash warning | The managed bootstrap encounters the intentionally concatenated bundle. [openssl-rehash](https://docs.openssl.org/master/man1/openssl-rehash/) requires one certificate/CRL per hash input. Keep the bundle and verification; do not disable TLS or globally silence warnings. |
| Link checker completion notice | Successful generated summary, supported by its actual report and annotations. Broken links and malformed/missing reports still fail existing regressions. |
| `error`, `warning` in echoed commands/test names | Shell source, deliberate negative tests and CodeQL rule configuration are not themselves runtime failures. Classified against step outcomes, annotations and retained reports rather than a grep word count. |
| Pages DEP0040 workaround | Existing deployment-step-only filter documents its upstream dependency and removal condition. No new blanket warning filter was introduced. |

Audit sources are saved under `research/` with immutable template commits. Further existing components considered: [Octokit retry](https://github.com/octokit/plugin-retry.js) supplies retry policy hooks, but the current pinned `gh`/strict probes already distinguish refusal from transient transport failures; a new retry layer would not fix malformed target input. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) supports the existing OIDC path; no secret-token fallback or unchecked publication was added.

## 8. Fresh CI rejects workspace-relative composite actions; wider audit exposes cooldowns

Run **40842161874**, source `11e0bf9c`, failed workflow lint with 11 low-severity `self-repository` findings. The full failed job log is `ci-logs/40842161874-job-123341909724-api.log`; its summary is at line **535**, followed by exit 12 at **536**. The original new cache-action references used workspace-relative `./...`, which can depend on runtime filesystem state. [Zizmor's rule](https://docs.zizmor.sh/audits/#self-repository) and GitHub's supported self-repository `$/...` syntax identify the safer correction. Every maintained call now uses that syntax; the rule is not disabled or severity-filtered.

The existing workflow scan covered `.github/workflows` only. Scanning the entire `.github` directory also checks composite actions and Dependabot, reproducing five medium-severity cooldown findings in `validation/zizmor-after.log`. All five ecosystem entries now explicitly use seven days for routine version updates. [GitHub's configuration reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#cooldown) confirms security updates bypass this delay. The CI command now scans all `.github`, and the same pinned zizmor 1.31.1 reports no findings after existing reviewed exceptions (`validation/zizmor-final.log`). This repairs the newly introduced references and closes an actual static-analysis coverage gap.

## 9. Actionlint predates valid self-repository syntax

The next fresh run, **40844647863**, failed at actionlint before reaching zizmor: `ci-logs/40844647863-job-123349191545-api.log:302–356` contains 11 unsupported-syntax diagnostics and line **357** records exit 1. Runner 2.338.0 actually resolved and executed the action at the exact merge commit (lines **231–274**); this is a linter false positive. The latest stable actionlint remains 1.7.12, released before GitHub added this syntax; [upstream issue 711](https://github.com/rhysd/actionlint/issues/711) documents the compatibility gap and configuration workaround.

Plan applied: retain the recommended secure syntax and the pinned actionlint distribution. Configure a temporary exception for the exact npm-cache reference and exact diagnostic, in only its two callers. The cache contract verifies that the reference is exact and its action file exists. Remove the exception once a supporting actionlint release is available. The real bundled-tool experiment `rehearse-actionlint.py` proves that the valid action passes while another invalid action reference and a genuine ShellCheck SC2086 still fail. This avoids disabling actionlint, downgrading zizmor, ignoring a diagnostic class, or building an unreleased checker fork. The failed-before log, passing-after log and negative checks are archived.
