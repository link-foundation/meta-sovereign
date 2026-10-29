# Complete template and Hive Mind comparison

## Immutable inputs and complete-tree method

| Input | Commit | Recursive entries | Files |
| --- | --- | ---: | ---: |
| JavaScript template | `0a3957d8195271829aa3cd5adce58a98fe73be2b` | 544 | 482 |
| Rust template | `0ece2cf2c2745c3574ffb65dbabdfcadd7163c14` | 241 | 202 |
| Python template | `317c243a7cc832b0abfe4d30989c5095d17fcd78` | 132 | 121 |
| Hive Mind best practices | `279ac05609d2a791c184c4f9fe7ee071e40ef6a4` | full tree JSON retained | cited document retained |

All 805 template files, including hidden files, tests, configuration, nested
composite actions and helper subdirectories, are downloaded and inventoried.
Every recursive Git tree is checked for truncation. The archive contains:

- `templates/NAME/{commit.json,tree.json,source.tar.gz,source/}`: immutable source.
- `comparison/all-template-files.json`: all 917 tree entries, every file SHA256,
  counterpart, equality decision and disposition. This includes product/docs
  files as requested, not only `.github/workflows`.
- `comparison/NAME.md`: complete file-by-file counterpart/disposition tables.
- `comparison/NAME.diff`: whole text diffs for every existing counterpart below
  250 KB; larger/binary files still have hashes and archived originals.
- `comparison/local-tracked-tree.txt` and `local-workflow-inventory.json`: local
  files plus every job's needs, condition, runner, deadline, permissions,
  concurrency and steps. There are five maintained workflows and 34 job definitions.
- `research/NAME-contracts.txt`: workflow/helper contract excerpts, including
  helpers without a same-named local counterpart.

`experiments/issue-52/compare.py` reproduces the exhaustive mapping. A missing
same-named file means compare the role below; it is not evidence that the role
was omitted. Template sample applications, badges, changelog history and branding
are preserved as reference rather than substituted for this application's code.

## Workflow and helper roles across all three templates

| Role / template files | Local application and decision |
| --- | --- |
| Release workflows; `detect-code-changes.*`, `pr-comparison.mjs`, fresh-merge scripts | Existing `release.yml`, `detect-code-changes.mjs`, `simulate-fresh-merge.sh` inspect the complete PR/push range and test a fresh main merge. All maintained workflow/helper/native paths are included. Preserve product-specific path coverage rather than replacing it with a sample language-only filter. |
| Syntax, line-size, lint, formatting, required-docs scripts | Existing compilation, max-1500-lines, ESLint/Prettier, duplication, required-doc and four-language checks remain enabled. Python utilities compile; native Swift helpers compile on supported macOS/Linux jobs. Template example-only lints do not replace these checks. |
| Node/package-manager setup, bootstrap/use-module/js-paths/run-command scripts | Existing Node/npm exact pins, lockfile-based npm ci, module loaders, root/nested path handling and cross-spawn launcher are retained. No install/resolution is added to versioning. Installed Changesets is invoked with no-install. |
| JS changeset/version/instant-version scripts; Rust changelog/version modules; Python bump/version/changelog helpers | This product releases one npm/application version with Changesets; Rust is a workspace component and Python files are utilities, not independent crates.io/PyPI products. All actual normal/instant modes get lockfile-preserving version updates. Existing fragment consolidation, no-manual-version check and release-needed policy remain. Template release-history fragments are not imported. |
| Git push failure classifiers, rebase retry, land-via-PR/version-and-commit helpers | Shared writer group plus bounded, classified push recovery now covers the local main version writer. Each retry fetches/revalidates and regenerates metadata on remote history. Source changes supersede the run. No force push. Changeset-PR action owns its PR branch; deployment actions do not push main. No generic main-landing command is introduced into the application. |
| Registry helpers, publish retry/classifier, wait-for-version, release state/naming/notes/create-release | Existing npm exact-404 probes, shared deadline, classified transport retry, release metadata and registry visibility checks remain. Npm OIDC and GitHub release recovery are already implemented. Independent crates.io/PyPI publication helpers are inapplicable because this repo publishes neither product there. |
| Credentials/dependency-graph preflight; sanitized npm config | Existing early preflight distinguishes PR reporting from strict main release checks and explains npm publisher/dependency graph setup. Unknown/API refusals do not become absence/success. Contributor PRs need no release secrets. No unused DockerHub, GHCR, crates.io or PyPI credential requirement is imposed. |
| Pipeline-status scripts and status-gate coverage tests | Existing terminal release/security gates cover all required runtime/browser/native/security prerequisites and reject cancelled/failed needed jobs. Fresh PR merge validation and independent Pages/desktop outputs remain required checks. No permissive continue-on-error security gate is copied. |
| Security workflows, CodeQL configs and dependency audit scripts | Existing release/scheduled dependency audits remain. All three templates upload SARIF without a findings verdict: this shared defect is reported upstream. Both local analysis paths now run the same strict SARIF gate, archive reports and retain every enabled query. |
| Dependency review/Dependabot and lockfile checks | Existing pinned lockfiles, peer graph integrity tests, advisory audit, dependency review and managed Dependabot updates remain. Managed-runner certificate warnings are classified separately from package failures. Dependency bumps are verified on all desktop targets in CI. |
| `workflows.yml`, actionlint tool checks, shell script tests, zizmor config | Local workflow-contract job already uses the pinned actionlint Docker image (ShellCheck/pyflakes included), standalone shell checks, offline pinned zizmor and JavaScript contract tests. New writer/warning/SARIF/release regressions run in that job. No need for a duplicate workflow with identical checks. |
| Links/web-archive checker scripts and workflows | Existing broken-link workflow checks actual live URLs; archive availability never turns a broken source link green. Invalid/missing reports fail. Tests preserve link-report parsing and status. |
| JS example-app, javascript-first-example/gate workflows; Rust JS-first workflows and demo tests | These demonstrate sequencing an example product before a template's own release. Local application/package/browser/native checks already gate its own release; shipping the template demo application or self-test workflow would add an unrelated product. File-by-file sources are retained. |
| Rust desktop workflow/resolve/package scripts | Local desktop workflow builds Linux x64/ARM64, Windows x64/ARM64 and macOS x64/ARM64, keeps source-tree identity, creates manifests and publishes only after gates. Missing/incomplete upstream evidence now fails closed. Correct blocked/superseded skips are explicitly annotated. |
| Python docs workflow, JS Pages helpers, preview-image scripts | Existing API-docs build, four-language validation and Pages build/deploy/e2e gates implement the actual product's docs/site. No Python sample docs site or generated template preview is required. Pages uses only the narrow documented upstream DEP0040 workaround shared with JS/Rust templates. |
| Docker native-build composite actions, resilience/backoff/budget wrappers | Local native/container checks run on explicit native runners and test the existing Docker build, without introducing a registry-image product. The template composite registry publisher and Buildx release fan-out are inapplicable until images become a release target. Existing job deadlines and bounded retry helpers preserve observability; broad wrappers are unnecessary. |
| Pre-commit hooks, staged-formatting/config scripts | Root lint-staged explicitly selects package.json, so archived template configs cannot execute their hooks. Existing fixture regression verifies that isolation. Generated bundle and evidence exclusions remain scoped. |
| Template tests, configuration, docs, examples and remaining data | Every file has an archived disposition/hash. Adopt portable policies and equivalent local regression contracts; preserve existing product-specific tests, runtime targets, localization, docs, license and package identity. Do not import another project's release history, example API, packaging manifests or sample credential requirements. |

## Every Hive Mind principle

Source: [immutable best-practices document](https://github.com/link-assistant/hive-mind/blob/279ac05609d2a791c184c4f9fe7ee071e40ef6a4/docs/CI-CD-BEST-PRACTICES.md).

| # | Principle | Application and verification |
| ---: | --- | --- |
| 1 | Relevant change ranges | Existing complete-range detector and CI contract regressions; workflow/helpers and native/container paths included. |
| 2 | File-size limits | Existing 1500-line file checks remain; evidence is bundled with independently verifiable member hashes. |
| 3 | Automated formatting | Existing Prettier and pre-commit checks; changed code/docs formatted before commit. |
| 4 | Static analysis/linting | Existing ESLint, clippy, syntax, CodeQL and duplication gates preserved; SARIF verdict added. |
| 5 | Fast-fail ordering | Compilation/lint/workflow/dependency/version/changeset/preflight gates precede heavy runtime/browser/Rust checks. |
| 6 | Changeset versioning | One PR changeset, no manual package bump. Both version modes preserve the validated dependency graph. |
| 7 | Actual merge result | Existing fresh-main merge simulation runs in relevant jobs; source tree guard rejects later source/dependency drift. |
| 8 | Pre-commit hooks | Root explicit-config lint-staged remains; archived template configs are inert. |
| 9 | Automated releases | Existing npm OIDC/GitHub release recovery, registry state checks and artifact gates retained; versioning failure repaired rather than bypassed. |
| 10 | Concurrency and safe recovery | All five writers share noncancellable repository group; other jobs cancel superseded checks. Bounded classified push recovery recomputes metadata after refetch, preserves history, and sets success only after push. Real Git rehearsal covers the race. |
| 11 | Secret detection | Existing secretlint and ignore boundaries retained; debug modes do not print credentials or user data. |
| 12 | Documentation validation | Four-language requirements/operations docs updated; required-doc validation remains. Investigation reports in dev/log are English evidence. |
| 13 | Native architecture container builds | Existing native/container jobs and desktop architectures preserved. No QEMU publisher added for a registry product that does not exist. |
| 14 | Workflow/shell lint | Pinned actionlint Docker image includes ShellCheck/pyflakes; zizmor runs offline; workflow policy tests run before release. |
| 15 | Dependency tree audit | Committed npm lockfile audited on release and schedule, independent of CodeQL; PR dependency review retained. |
| 16 | Publish preflight | PRs report capabilities without secrets; main fails early with explicit publisher/dependency-graph setup instructions. No hypothetical registry credentials requested. |
| 17 | Pipeline vs changed world | Desktop blocked/superseded state emits notice, not silent success. Missing evidence fails; policies/auth failures do not retry. Known action deprecation is isolated/documented; managed runner certificate notice is not misclassified as an application failure. |

This comparison intentionally adopts useful mechanisms, including defects fixed
beyond their original single call site, while retaining this repository's wider
runtime/browser/native scope. Exact versions/SHAs make the comparison reproducible
if upstream templates change later.
