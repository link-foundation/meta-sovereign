# CI/CD Template Comparison

Issue #20 specifically asked to compare this repository with these
templates:

- `link-foundation/js-ai-driven-development-pipeline-template`
- `link-foundation/rust-ai-driven-development-pipeline-template`
- `link-foundation/python-ai-driven-development-pipeline-template`
- `link-foundation/csharp-ai-driven-development-pipeline-template`

The downloaded workflow snapshots and file inventories are preserved
under `templates/`.

## JavaScript Template

This repository is closely aligned with the JavaScript template. The
main differences in `release.yml` are expected downstream adaptations:

| Area                | JavaScript template                                 | `meta-sovereign`                                                                    | Assessment                                       |
| ------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Script paths        | `scripts/*.mjs`                                     | `js/scripts/*.mjs`                                                                  | Expected local layout difference.                |
| Deno command        | `deno test --allow-read`                            | `deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests` | Required by this repository's integration tests. |
| API docs            | No mixed JS/Rust docs build                         | Adds JS API docs and Rust crate docs build                                          | Product-specific hardening.                      |
| Required docs       | `BEST-PRACTICES`, `CONTRIBUTING`, README, CHANGELOG | Also requires `ROADMAP` and `REQUIREMENTS`                                          | Product-specific docs contract.                  |
| Release docs assets | Creates npm/GitHub release                          | Also attaches generated API docs                                                    | Product-specific release artifact.               |
| Pages workflow      | Not present                                         | `pages.yml` builds and deploys web app                                              | Product-specific publishing.                     |
| Link checker        | Same lychee and Web Archive pattern                 | Same pattern, adjusted script path                                                  | Aligned.                                         |

The failure was not caused by a deviation from the JavaScript template.
The template has the same core hardening that mattered here: cross-OS
runtime tests, `timeout-minutes`, matrix `fail-fast: false`, fast-check
ordering, changeset validation, lint/format/duplication/secret checks,
and fresh-merge simulation.

## Rust Template

The Rust template uses the same CI/CD principles in a Rust-specific
shape:

- Change detection before heavier jobs.
- Changelog fragment validation for code PRs.
- Version-change protection.
- `cargo fmt`, `cargo clippy`, `cargo test`, doc tests, coverage, and
  package build.
- Cross-OS tests with `fail-fast: false`.
- Timeouts on jobs.
- Release and manual release jobs.

There is no IndexedDB, Deno, or browser-store equivalent in the Rust
template.

## Python Template

The Python template follows the same high-level structure with
Python-specific tools:

- Change detection before heavier jobs.
- Ruff linting and formatting.
- mypy.
- pytest with coverage.
- Build and twine package validation.
- Changelog fragment check.
- Release and manual release jobs.

It does not exercise browser IndexedDB behavior or Deno's event-loop
pending-promise behavior.

## C# Template

The C# template follows the same pattern with .NET tooling:

- Change detection before heavier jobs.
- Changeset validation.
- `dotnet format`, `dotnet build`, `dotnet test`, package build, and
  NuGet release.
- Cross-OS tests with `fail-fast: false`.
- Manual release support.

It does not contain the failing JavaScript storage driver or any Deno
matrix cell.

## Template Issue Decision

No upstream issue is needed for this specific failure. The linked
templates do not contain the IndexedDB driver or test shim where the
race lived. The JavaScript template's workflow pattern is useful
because it runs Deno on Windows and exposes this class of bug, but the
correct repair belongs in this repository's storage code.
