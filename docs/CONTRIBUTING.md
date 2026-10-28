# Contributing to meta-sovereign (languages: en • [zh](CONTRIBUTING.zh.md) • [hi](CONTRIBUTING.hi.md) • [ru](CONTRIBUTING.ru.md))

## Development Workflow

1. **Fork the repository** and clone your fork
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Install dependencies**: `bun install` (or `npm install`)
4. **Make your changes**
5. **Run focused local checks** for the changed files; run the full test suite in GitHub CI/CD
6. **Create a changeset**: `bun run changeset`
7. **Commit and push** (pre-commit hooks will run automatically)
8. **Create a Pull Request**

## Code Standards

### File Size Limits

**Maximum 1500 lines per file** (enforced via ESLint `max-lines` rule and CI `check-file-line-limits` job).

This benefits both AI and human developers by ensuring files remain readable and maintainable.

### Formatting and Linting

All code must pass:

```bash
# Check formatting
bun run format:check

# Check linting
bun run lint

# Run all checks
bun run check
```

The pre-commit hook runs automatically, but you can also manually format and fix:

```bash
# Auto-fix formatting
bun run format

# Auto-fix lint issues
bun run lint:fix
```

### Testing Requirements

Run only specific tests locally. The full suite, stress tests and complete runtime/browser matrices belong in GitHub CI/CD. Do not run `npm test` or an unfiltered `bun test` locally; push the changes and review CI. Avoid concurrent heavy validation on a machine used interactively.

Tests should:

- Cover critical paths
- Work across all runtimes (Node.js, Bun, Deno)
- Use the [test-anywhere](https://github.com/link-foundation/test-anywhere) framework

```bash
# Local: run only the relevant test files, with limited concurrency
node --test --test-concurrency=1 js/tests/rolling-host.test.js js/tests/store-handoff.test.js

# Full suite: push and review the GitHub CI/CD results
```

## Version Management with Changesets

This project uses [Changesets](https://github.com/changesets/changesets) to manage versions and changelogs. This eliminates merge conflicts that occur when multiple PRs bump the version in `package.json`.

### Adding a Changeset

When you make changes that affect users, add a changeset:

```bash
bun run changeset
# or
npm run changeset
```

This will prompt you to:

1. Select the type of change (patch/minor/major)
2. Provide a summary of the changes

The changeset will be saved as a markdown file in `.changeset/` and should be committed with your PR.

### Changeset Guidelines

| Type      | When to Use                          | Examples                                            |
| --------- | ------------------------------------ | --------------------------------------------------- |
| **Patch** | Bug fixes, internal changes          | Fix typo, update dependency, refactor internal code |
| **Minor** | New features, non-breaking additions | Add new function, new optional parameter            |
| **Major** | Breaking changes                     | Remove function, change API signature               |

Example changeset summary:

```markdown
Add support for custom configuration via config file
```

### What Changes Need Changesets?

**Required** for:

- Bug fixes
- New features
- Breaking changes
- Public API changes

**Not required** for:

- Documentation-only changes (in `./docs` folder)
- Changes to markdown files
- CI/CD workflow updates (unless they affect users)

## Release Process

The release process is fully automated:

1. **PR with changeset merged** - The changeset is added to `.changeset/`
2. **CI detects changesets** - On push to main, CI checks for pending changesets
3. **Version bump** - Package version is updated based on changeset type
4. **Changelog update** - `CHANGELOG.md` is updated automatically
5. **npm publish** - Package is published via OIDC trusted publishing
6. **GitHub Release** - A release is created with formatted notes

### Multiple Changesets

If multiple PRs are merged before a release:

- All changesets are merged into one
- The highest version bump type wins (major > minor > patch)
- All descriptions are preserved in chronological order

## Pull Request Guidelines

### PR Title

Use a clear, descriptive title that summarizes the change:

```
feat: Add support for custom configuration
fix: Resolve race condition in async handler
docs: Update API documentation for v2
```

### PR Description

Include:

- **What** - Describe the change
- **Why** - Explain the motivation
- **Testing** - How the change was tested

### CI Checks

All PRs must pass:

- [ ] Test compilation (syntax check)
- [ ] Lint, format, and secrets scan
- [ ] File line limits check
- [ ] Changeset validation (for code changes)
- [ ] Documentation validation (when docs change)
- [ ] Tests on all platforms (Ubuntu, macOS, Windows)
- [ ] Tests on all runtimes (Node.js, Bun, Deno)

### Fresh Merge Simulation

The CI workflow automatically:

1. Merges the latest `main` into your PR branch
2. Runs checks against the merged state

If this fails with merge conflicts, you need to:

```bash
git fetch origin main
git merge origin/main
# Resolve conflicts
git push
```

<a id="working-rules"></a>

## Working rules

These apply to every change, by people and AI agents alike; this section is where every agent starts (no agent-specific file is kept in the repository). Each one came from a maintainer directive; [REQUIREMENTS.md](REQUIREMENTS.md) holds the product requirements they protect.

1. **Commit and push every change.** Once the checks pass, commit and push to `main`; if `main` moved meanwhile, rebase onto it first. Name the requirement IDs a change serves in its changeset.
2. **Track every requirement.** A new directive becomes a row in [REQUIREMENTS.md](REQUIREMENTS.md) with an ID and a status, in all four languages; what is still open is named in the status, never left out.
3. **Docs in four languages.** Every `docs/*.md` page exists in English, Russian, Hindi and Chinese with the language header; case studies under `docs/case-studies/` are English only.
4. **Secrets never leave the machine.** Session strings, tokens, passwords and keys are never printed, logged, committed or sent anywhere; masked hints show at most the first and last three characters (R-Y5).
5. **Fakes in tests and checks.** Tests and verification never dial real networks, read real browser profiles or credential stores, scan the user's machine or send from a real account; they inject fakes (`clientFactory`, `telegramMtproto`, memory stores, temporary folders) and never touch the real app folder.
6. **Look at a running app by counts, not contents.** Check a running server through its status (`/api/telegram/status`) and log line counts; never print the user's messages, contacts or credentials while debugging.
7. **Ask each network once.** Read the store first and ask the network only for what is missing, through the account's priority queue (R-Y24, R-Y25); keep everything the network said (R-Y28).
8. **Third-party code is a reference, not a dependency.** Open-source clients we learn from are listed in [CHAT-REFERENCES.md](CHAT-REFERENCES.md); downloaded copies are read only — never built, installed or run.
9. **Quality gates remain enabled.** Check changed files and run focused tests locally. Push and review the full lint, formatting, duplication and test suites in GitHub CI/CD; do not run the full test suite on the user’s machine. Split functions that exceed complexity or length limits. Rebuild `js/src/web/app.min.js` after web changes (`npm run build:web`).
10. **A local app for its user.** meta-sovereign is open source and runs on the user's own machine, on the user's own accounts, for the user's convenience: it acts only when and as the user asks, at the pace each network allows.
11. **Browsers through browser-commander, with no automation bars.** A browser the app opens, and one used to look at the web app while checking a change, is started by [browser-commander](https://github.com/link-foundation/browser-commander) with its default launch (the installed Chrome as a person starts it): never with a switch that makes Chrome show the "controlled by automated test software" or "unsupported command-line flag" bar (`--enable-automation`, `--disable-blink-features=AutomationControlled`). Such a bar in browser-commander itself is reported to its repository.
12. **A changed data shape ships with a migration.** If a change alters how anything is stored (a field, an id, a date format), add a numbered migration module in `js/src/storage/migrations/` and raise `CURRENT_SCHEMA` (R-Z17): idempotent, no network, with a fixture test on an old-shape store, an idempotency test, a dry-run count and a row in [DATA-MIGRATIONS.md](DATA-MIGRATIONS.md). The registry guard test fails if one is missing.

## Questions?

If you have questions about contributing, feel free to open an issue for discussion.

CI diagnostics, release prerequisites and recovery: [CI operations](CI-OPERATIONS.md) (R-Z32).
