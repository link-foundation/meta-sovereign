# meta-sovereign

A personal meta profile **sovereign** system. Fully local, privacy-respecting. The user actually owns and controls their data about their network of contacts, connections, and partners — across every social, messenger, and job-board network they use.

Tracked by issue [#1 — Prototype version 0.0.1](https://github.com/link-foundation/meta-sovereign/issues/1). The full case study, requirements list, architecture sketch, and phased solution plan live in [`docs/case-studies/issue-1/`](docs/case-studies/issue-1/README.md).

## What it does

- **Unified inbox** spanning VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru.
- **Personal CRM**: contacts, communities, group memberships, intersections, mass-personal outreach.
- **Personal memory**: structured `question → answer` facts captured automatically from conversations.
- **Conversation automation platform**: pattern editors, reply-variation editors, n8n-style dialog graphs.
- **Portable data store**: dual binary ([Doublets](https://github.com/linksplatform/doublets-rs)) + text ([Links Notation](https://github.com/link-foundation/links-notation)) representation, automated backups, `.lino` import/export.
- **Local-first runtime**: WebRTC sync between user-owned devices, optional self-hosted personal cloud.
- **Two stacks**: JS + Rust/WebAssembly (default) and pure Rust (server/microservice variant). The on-disk format is shared.

This repository is built on top of [`link-foundation/js-ai-driven-development-pipeline-template`](https://github.com/link-foundation/js-ai-driven-development-pipeline-template) and inherits its CI/CD jobs. PR #2 has since expanded the codebase into a runnable system: storage, archive importers, live service connectors, CLI, HTTP, React SPA, WebSocket/WebRTC sync, handler bus, encrypted backups, and the pure-Rust server are all implemented and tested. The full requirement → status mapping lives in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md); the per-iteration breakdown is in [`docs/case-studies/issue-1/`](docs/case-studies/issue-1/README.md).

## Status

The prototype targeted by issue #1 is implemented and tracked in PR #2:

- **Data layer (R-A\*)**: `DualStore` keeps Doublets binary + Links Notation text in lock-step, with AES-256-GCM at-rest backups (`createBackupScheduler`) and `secret:*` link encryption.
- **Service connectors (R-E\*)**: archive parser + live API connector for VK, Telegram, X, WhatsApp, Facebook, LinkedIn, career.habr.com, hh.ru, superjob.ru.
- **Pattern matching and automation (R-C\*)**: `inferRegex` / `simplifyRegex` / `compilePeg`, fuzzy reply-variation extraction, and an n8n-style automation graph (`createGraph` + `runGraph`).
- **CRM (R-D\*)**: contact aggregation, audience DSL, mass-personal outreach, profile and resume sync envelopes.
- **Distribution (R-F\*)**: NPM library, CLI (`bin/meta-sovereign.js`), local server (`meta-sovereign serve`), Electron shell, Capacitor mobile shell, Docker microservices for web + WebRTC.
- **Stacks (R-G\*)**: default JS server + React SPA + Rust/WASM heavy workloads; alternative pure-Rust server (`meta-sovereign-rs serve`).
- **Quality (R-H\*)**: JS and Rust workspace tests; real-browser e2e via [`browser-commander`](https://github.com/link-foundation/browser-commander); axe-core WCAG 2.0 A/AA audit; cross-runtime CI matrix (Node, Bun, Deno × Ubuntu, macOS, Windows).

## Inherited features (CI/CD baseline)

- **Multi-runtime support**: Works with Bun, Node.js, and Deno
- **Universal testing**: Uses [test-anywhere](https://github.com/link-foundation/test-anywhere) for cross-runtime tests
- **Automated releases**: Changesets-based versioning with GitHub Actions
- **Code quality**: ESLint + Prettier with pre-commit hooks via Husky
- **Package manager agnostic**: Works with bun, npm, yarn, pnpm, and deno
- **Broken link checks**: Automated link validation with [lychee](https://github.com/lycheeverse/lychee-action) and Web Archive fallback suggestions

## Quick Start

### Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Or with other runtimes:
npm test
deno test --allow-read --allow-write --allow-env --allow-net --allow-sys

# Run the real-browser e2e (opt-in; needs Playwright + Chromium)
RUN_BROWSER_E2E=1 npm run test:e2e:browser

# Run the Rust workspace tests
cargo test --workspace

# Lint code
bun run lint

# Format code
bun run format

# Check all (lint + format + file size)
bun run check
```

## Project Structure

```
.
├── .changeset/           # Changeset configuration
├── .github/workflows/    # GitHub Actions CI/CD (release.yml, links.yml)
├── .husky/               # Git hooks (pre-commit)
├── bin/                  # CLI entrypoint (meta-sovereign)
├── crates/               # Pure-Rust workspace (core, server, wasm)
├── docker/               # Web + WebRTC microservice Dockerfiles
├── docs/                 # REQUIREMENTS, case studies, design docs, screenshots
├── electron/             # Electron desktop shell + preload bridge
├── examples/             # Usage examples
├── experiments/          # Throwaway/exploration scripts
├── mobile/               # Capacitor mobile shell
├── scripts/              # Build and release scripts (CI/CD parity with JS template)
├── src/                  # Source code (storage, sources, sync, broadcast, handlers, server, web, ...)
├── tests/                # Cross-runtime unit + integration tests, real-browser e2e
├── bunfig.toml           # Bun configuration
├── capacitor.config.json # Capacitor mobile config
├── deno.json             # Deno configuration
├── eslint.config.js      # ESLint configuration
├── Cargo.toml            # Rust workspace manifest
└── package.json          # Node.js package manifest
```

## Design Choices

### Multi-Runtime Support

This template is designed to work seamlessly with all major JavaScript runtimes:

- **Bun**: Primary runtime with highest performance, uses native test support (`bun test`)
- **Node.js**: Alternative runtime, uses built-in test runner (`node --test`)
- **Deno**: Secure runtime with built-in TypeScript support (`deno test`)

The [test-anywhere](https://github.com/link-foundation/test-anywhere) framework provides a unified testing API that works identically across all runtimes.

### Package Manager Agnostic

While `package.json` is the source of truth for dependencies, the template supports:

- **bun**: Primary choice, uses `bun.lockb`
- **npm**: Uses `package-lock.json`
- **yarn**: Uses `yarn.lock`
- **pnpm**: Uses `pnpm-lock.yaml`
- **deno**: Uses `deno.json` for configuration

Note: `package-lock.json` is not committed by default to allow any package manager.

### Code Quality

- **ESLint**: Configured with recommended rules + Prettier integration
- **Prettier**: Consistent code formatting
- **Husky + lint-staged**: Pre-commit hooks ensure code quality
- **File size limit**: Files must stay under 1500 lines for maintainability (enforced via ESLint and CI)

### Release Workflow

The release workflow uses [Changesets](https://github.com/changesets/changesets) for version management:

1. **Creating a changeset**: Run `bun run changeset` to document changes
2. **PR validation**: CI checks for valid changeset in each PR
3. **Automated versioning**: Merging to `main` triggers version bump
4. **npm publishing**: Automated via OIDC trusted publishing (no tokens needed)
5. **GitHub releases**: Auto-created with formatted release notes

#### Manual Releases

Two manual release modes are available via GitHub Actions:

- **Instant release**: Immediately bump version and publish
- **Changeset PR**: Create a PR with changeset for review

### CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/release.yml`) implements a fast-fail pipeline:

**Fast checks** (~7-30s each, run first for fastest feedback):

1. **Test compilation**: Syntax-checks all `.mjs` files with `node --check`
2. **Lint, format & secrets scan**: ESLint, Prettier, jscpd, and [secretlint](https://github.com/secretlint/secretlint) for credential leak detection
3. **File line limits**: Enforces 1500-line limit on `.mjs` files and `release.yml`
4. **Changeset check**: Validates PR has exactly one changeset (added by that PR)
5. **Version check**: Blocks manual version changes in `package.json`
6. **Documentation validation**: Checks doc file sizes and required files

**Slow checks** (only run after all fast checks pass):

7. **Test matrix**: 3 runtimes × 3 OS = 9 test combinations
8. **API doc build**: `npm run docs:api` + `cargo doc --no-deps --workspace`
9. **Broken link checks**: Validates all links in Markdown/HTML files (separate workflow)

**Release** (on merge to main):

10. **Changeset merge**: Combines multiple pending changesets at release time
11. **Release**: Automated versioning and npm publishing

#### Reasonable timeouts on every job

Every CI job declares an explicit `timeout-minutes` so a hung step
fails fast instead of stalling for the GitHub default of six hours.
The bands are sized at roughly 5–10× the observed p95 to absorb cold
runners without hiding real flakiness:

| Job                        | Cap      | Typical                                      |
| -------------------------- | -------- | -------------------------------------------- |
| Detect Changes / file size | 5 min    | ~3–6 s                                       |
| Test Compilation           | 5 min    | ~4 s                                         |
| Version / Changeset checks | 5–10 min | ~6–13 s                                      |
| Lint and Format            | 10 min   | ~23 s                                        |
| Build API Docs             | 15 min   | ~25 s                                        |
| Test (per runtime × OS)    | 10 min   | ~13–55 s (deno-windows up to ~2 min on cold) |
| Release / Instant Release  | 30 min   | well under 10 min                            |
| Broken Link Checker        | 10 min   | ~8 s                                         |

Per-test timeouts are also enforced inside the runners themselves so
an individual hung promise surfaces in seconds rather than at the job
cap: `node --test --test-timeout=30000` and `bun test --timeout 30000`.

See [BEST-PRACTICES.md](docs/BEST-PRACTICES.md) for detailed explanations of each practice.

#### Robust Changeset Handling

The CI/CD pipeline is designed to handle concurrent PRs gracefully:

- **PR Validation**: Only validates changesets **added by the current PR**, not pre-existing ones from other merged PRs. This prevents false failures when multiple PRs merge before a release cycle completes.

- **Release-time Merging**: If multiple changesets exist when releasing, they are automatically merged into a single changeset with:
  - The highest version bump type (major > minor > patch)
  - All descriptions preserved in chronological order

This design decouples PR validation from the need to pull changes from the default branch, reducing conflicts and ensuring that even if CI/CD fails, all unpublished changesets will still get published when the error is resolved.

### Broken Link Checker

The link checker workflow (`.github/workflows/links.yml`) validates all links in Markdown and HTML files:

1. **Detection**: Uses [lychee](https://github.com/lycheeverse/lychee-action) to scan all `*.md` and `*.html` files
2. **Web Archive fallback**: For any broken links found, automatically checks the [Wayback Machine](https://web.archive.org) for archived versions
3. **Actionable suggestions**: Reports one of three outcomes for each broken link:
   - **Archived**: Suggests the Web Archive URL as a replacement
   - **Not archived**: Clearly reports the link is unrecoverable
4. **Scheduled checks**: Runs weekly to catch links that break over time (even if no files changed)
5. **Issue creation**: On scheduled runs, creates a GitHub Issue with the full broken links report

Add regex patterns to `.lycheeignore` to exclude URLs from checks (e.g., local dev URLs, example.com, known rate-limited sites).

## Configuration

### ESLint Rules

Customize ESLint in `eslint.config.js`. Current configuration:

- ES Modules support
- Prettier integration
- No console restrictions (common in CLI tools)
- Strict equality enforcement
- Async/await best practices
- **Strict unused variables rule**: No exceptions - all unused variables, arguments, and caught errors must be removed (no `_` prefix exceptions)

### Prettier Options

Configured in `.prettierrc`:

- Single quotes
- Semicolons
- 2-space indentation
- 80-character line width
- ES5 trailing commas
- LF line endings

## Scripts Reference

| Script                 | Description                             |
| ---------------------- | --------------------------------------- |
| `bun test`             | Run tests with Bun                      |
| `bun run lint`         | Check code with ESLint                  |
| `bun run lint:fix`     | Fix ESLint issues automatically         |
| `bun run format`       | Format code with Prettier               |
| `bun run format:check` | Check formatting without changing files |
| `bun run check`        | Run all checks (lint + format)          |
| `bun run changeset`    | Create a new changeset                  |

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed contribution guidelines.

Quick steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Create a changeset: `bun run changeset`
5. Commit your changes (pre-commit hooks will run automatically)
6. Push and create a Pull Request

## Best Practices

The CI/CD pipeline inherited from `js-ai-driven-development-pipeline-template` covers the practices documented in [BEST-PRACTICES.md](docs/BEST-PRACTICES.md):

- File size limits for AI readability
- Automated formatting and linting
- Multi-runtime and cross-platform testing
- Changeset-based versioning
- Concurrency control for CI/CD pipelines

## License

[Unlicense](LICENSE) - Public Domain
