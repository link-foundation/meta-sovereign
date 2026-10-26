# meta-sovereign (languages: en • [zh](README.zh.md) • [hi](README.hi.md) • [ru](README.ru.md))

**One inbox, one contact book and one set of automations for every network you speak through — running on your own machine.**

meta-sovereign represents **a person or an organisation online**. Connect Telegram, VK, WhatsApp, Facebook and Instagram, X, LinkedIn, email, GitHub, Upwork, PeoplePerHour and job boards (career.habr.com, hh.ru, superjob.ru and more), and work every conversation from one app. Local-first and open source: your messages, contacts and keys stay in a store you own, with encrypted backups and no cloud in between.

### Built for

| Who / what        | How meta-sovereign helps                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Individuals**   | All your chats in one place, reconnect with people gone quiet, remember what was said (facts), one CV on every job site.                                         |
| **Sales**         | Leads from every network in one CRM, audiences by rule, mass-personal outreach that sends each message once and politely, follow-ups, fast replies.              |
| **Marketing**     | Broadcasts to audiences, posts to Telegram channels, LinkedIn and X, community members kept fresh, an opt-out list every automated send honours.                 |
| **User support**  | One Operator queue for every incoming message, answers from a VK community or Telegram Business account, auto-replies as safe drafts, a knowledge base of facts. |
| **Organisations** | The same tools for a brand, a shop or a project: its accounts, its contacts, its data on its own machine. Team mode (several operators) is on the roadmap.       |

What works for each scenario today, what is partial and what comes next is in the roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Try it now (no install)

Open <https://link-foundation.github.io/meta-sovereign/> in any modern browser. The web app boots immediately, runs entirely in your browser, and writes to local storage by default — nothing leaves your device until you point it at a server.

> If the link is not yet live, the GitHub Pages workflow (`.github/workflows/pages.yml`) publishes it on the next push to `main`.

Without a server the hosted app runs in **browser-only mode**: contacts, patterns and broadcasts work from the browser store, while imports, automations, sync, CV sync and greetings wait for a local server. A notice shows the command to start one and a **Check again** button.

## Desktop app

Download the installer for your system from <https://link-foundation.github.io/meta-sovereign/download/>, or from [GitHub releases](https://github.com/link-foundation/meta-sovereign/releases): Linux (AppImage, deb, tar.gz), macOS (dmg, zip) and Windows (installer, portable), each for x64 and arm64. The desktop app bundles the server, so every feature works without starting one yourself. First-launch steps for unsigned builds, checksums and update notes are in [`docs/USER-GUIDE.md` §4](docs/USER-GUIDE.md#4-install-the-desktop-or-mobile-app).

## Run a local server (recommended for sync)

To sync between devices, keep encrypted backups, and unlock the full feature set, start a local server next to the SPA. Two backends are available; both implement the same wire protocol (see [`docs/SERVER-PARITY.md`](docs/SERVER-PARITY.md)).

### Rust server — single binary, no runtime, but limited

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
cargo run --manifest-path rust/Cargo.toml -p meta-sovereign-server -- serve
```

> **Rust server limits.** It keeps links **in memory only**: nothing is written to disk, so everything is gone when the server stops. It has **no source adapters**: no live fetches from Telegram, VK, GitHub, Upwork or similar, no outbound HTTP or TLS client (email only ingests archives), and no automations, CV sync, browser auto-import, backups or `/api/export-encrypted`. Pick the JS server or the desktop app for real use. The route-by-route list is in [`docs/SERVER-PARITY.md`](docs/SERVER-PARITY.md).

### JavaScript server — full feature set (Node/Bun/Deno), from source

The package is **not published on npm yet** (the registry answers 404), so `npx -y meta-sovereign serve` does not work today. Run the server from a source checkout (needs Node.js and npm):

```bash
git clone https://github.com/link-foundation/meta-sovereign
cd meta-sovereign
npm install
node js/bin/meta-sovereign.js serve
```

Once the package is published to npm, `npx -y meta-sovereign serve` (or `npm install -g meta-sovereign && meta-sovereign serve`) will work. Until then, the desktop app (above) is the way to run the server without a toolchain.

Either backend listens on <http://127.0.0.1:8787> by default. The JS server answers the hosted app's origin (`https://link-foundation.github.io`) with CORS headers; allow other origins with `meta-sovereign serve --allow-origin=<origins>` or `MS_ALLOW_ORIGINS`. Safari does not let `https` pages reach `http://127.0.0.1`, but it allows `https://127.0.0.1`; the server also answers HTTPS on the same port with its own certificate for localhost — run `node js/bin/meta-sovereign.js trust` once (macOS adds it to the login keychain; other systems print the certificate path), or open `https://127.0.0.1:8787/trust` in Safari and follow the prompts, and the hosted app connects directly. Before trusting, the notice names the server and offers **Trust the server** (<https://127.0.0.1:8787/trust>); it links a localhost UI only if that UI was explicitly enabled. `--tls=false` / `MS_TLS=off` turns HTTPS off. Safari uses the hosted app through the trusted local HTTPS API; the localhost UI is optional. The hosted SPA discovers the local server automatically through `discoverServer()` (saved override → `127.0.0.1` ports). If your browser does not auto-connect, open the in-app **Settings → Server** prompt and paste the URL the binary printed.

The hosted app is the default UI: `serve` prints its address, <https://link-foundation.github.io/meta-sovereign/>, and the app finds the server on our port 8787 by itself (it also looks at 8788, 7001, 7002 and 3000; on another port `serve` says to set it in **Settings → Server**), so the server does not have to host a web site. By default `/` redirects to GitHub Pages and the server serves only its API, sync transports and connection helpers. To opt into a localhost web app for offline use, run `serve --local-ui=true` (or set `MS_LOCAL_UI=on`); that copy is then available at <http://127.0.0.1:8787>. Desktop shells explicitly enable their bundled UI. `--ui-url=<url>` (or `MS_UI_URL`) names another hosted copy, such as a fork's Pages, and allows its origin.

On macOS, interactive `serve` now handles the full setup: it protects this installation’s TLS key with Secure Enclave, detects existing certificate trust, requests trust only when needed, and opens the GitHub Pages app. For a headless launch use `node js/bin/meta-sovereign.js serve --trust=true --open=true`. `--trust=false` and `--open=false` opt out. The Swift helper needs the macOS Command Line Tools; `--hardware-key=false` explicitly opts into a file key on unsupported Macs. Hardware protection applies to the key on disk; Node uses it in memory. See [local server setup and security](docs/LOCAL-SERVER-SECURITY.md) for the exact access rules and limits.

## Connect the SPA to your server

The SPA picks a server in this order ([`js/src/web/discover.js`](js/src/web/discover.js)):

1. **Same origin** — when you serve the SPA from the JS or Rust server directly.
2. **Saved override** — `localStorage.metaServer`. Set via the in-app **Settings → Server** prompt.
3. **Runtime shell candidates** — Electron and Capacitor inject the embedded server URL.
4. **`127.0.0.1` ports** — the default local-server port is probed automatically.
5. **Caller-supplied LAN candidates** — passed programmatically.

If nothing answers, the SPA falls back to **offline mode**: writes go to the local browser store ([`createBrowserStore`](js/src/storage/browser-store.js): IndexedDB → localStorage → in-memory) and replay automatically through [`OfflineClient`](js/src/web/client.js) the next time a server appears.

The full user-facing flow — install nothing, install Rust server, install JS server, install desktop / mobile app, encrypted export, troubleshooting — is in [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md).

## What it does

- **Unified inbox** across VK, Telegram, X, WhatsApp, Facebook, Instagram, LinkedIn, email, GitHub, Upwork, PeoplePerHour and job boards, with live updates where the network allows (Telegram, the VK Long Poll, incremental IMAP, GitHub) and full-size archive imports for the rest.
- **Chat that behaves like Telegram's own apps**: each message sent once, delivery ticks, live updates and catch-up after a gap, read marking, cloud drafts, retries that survive a reload. How the open-source Telegram, Signal and Element clients do it, pinned to the commits we read, is in [`docs/CHAT-REFERENCES.md`](docs/CHAT-REFERENCES.md).
- **CRM**: everything known about a contact in one view, the same person across networks, communities and memberships, search, audiences by rule (`friends:vk & chat:vk:… - list:blocked`).
- **Outreach, broadcasts and automations**: who to message, when, on what conditions and with which text; a preview of who gets what; safe drafts by default or paced auto-send with quiet hours, a per-chat cooldown, daily caps and an opt-out list. Every automated send goes through one outbox, so it happens at most once and an unclear result is never retried by itself ([`docs/USER-GUIDE.md` §11](docs/USER-GUIDE.md#11-automations-message-people-by-rule-safely)).
- **Operator queue and replies**: walk unread messages chat by chat, reply suggestions from your own past answers (Tab takes one), patterns and reply variations, auto-replies on a matching message.
- **Business and community accounts**: a VK community token runs the Bots Long Poll; Telegram Business quick replies, greeting and away messages, hours and chatbots.
- **Memory**: structured `question → answer` facts captured from conversations, checked in the chat.
- **Greetings**: open dialogs on VK, Telegram, WhatsApp, Messenger, X and email with a "hi" or a greeting sticker, the way [konard/vk-bot](https://github.com/konard/vk-bot) does ([`docs/GREETINGS.md`](docs/GREETINGS.md)).
- **CV synchronisation** across LinkedIn, hh.ru, Habr Career, Naukri, VietnamWorks, TopCV and SuperJob through your own browser, field by field ([`docs/CV-SYNC.md`](docs/CV-SYNC.md)).
- **Your data, safe**: a crash-safe local store ([Doublets](https://github.com/linksplatform/doublets-rs) binary + [Links Notation](https://github.com/link-foundation/links-notation) text), automatic schema migrations ([`docs/DATA-MIGRATIONS.md`](docs/DATA-MIGRATIONS.md)), streamed encrypted backups, full-disk handling, encrypted secrets, a local server that refuses other sites.
- **Everywhere you are**: the hosted web app, a desktop app with the server inside, mobile shells, WebRTC sync between your own devices, offline writes replayed later; a pure-Rust server variant shares the on-disk format.
- **Four languages**: the app and every document are in English, Russian, Hindi and Chinese.

Every feature, network by network, with what is supported, partial or not supported and whether it is reachable by API or web app: [`docs/FEATURES.md`](docs/FEATURES.md). Every requirement with its evidence: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Status

Requirements R-A to R-Z24 are done and checked in CI on Node, Bun and Deno across Linux, macOS and Windows, with browser end-to-end tests in Chromium. Tests use fakes: nothing is sent from a real account in tests, and only Telegram's message display was also checked against a real store. The scenario-by-scenario state and the next steps (live verification, guided sign-in, team mode, a sales pipeline, campaign results) are in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Repository structure

`meta-sovereign` is multi-language. Each language tree mirrors the corresponding [link-foundation AI-driven-development pipeline template](https://github.com/link-foundation):

- **JavaScript** lives under `js/`: `js/src/`, `js/tests/`, `js/scripts/`, `js/bin/`, `js/electron/`, `js/examples/`, and `js/experiments/`.
- **Rust** lives under `rust/`: `rust/Cargo.toml`, `rust/Cargo.lock`, and the `rust/crates/` workspace (`meta-sovereign-server`, `meta-sovereign-core`, `meta-sovereign-wasm`).
- **Native shells**: `js/electron/` (desktop), `mobile/` + `capacitor.config.json` (iOS/Android), `docker/` (web + WebRTC microservices).
- **Operations**: `.github/workflows/` (CI/CD), `.changeset/` (release management), `docs/` (this guide and case studies).

```
.
├── .changeset/           # Changeset configuration
├── .github/workflows/    # GitHub Actions CI/CD (release.yml, links.yml, pages.yml)
├── .husky/               # Git hooks (pre-commit)
├── docker/               # Web + WebRTC microservice Dockerfiles
├── docs/                 # REQUIREMENTS, USER-GUIDE, SERVER-PARITY, case studies
├── js/                   # JavaScript tree (src, tests, scripts, bin, electron)
├── mobile/               # Capacitor mobile shell
├── rust/                 # Rust workspace manifest, lockfile, and crates
├── bunfig.toml           # Bun configuration
├── capacitor.config.json # Capacitor mobile config
├── deno.json             # Deno configuration
└── package.json          # Node.js package manifest
```

---

## Developer reference

Everything below is for contributors. End-users do not need to read it.

### Inherited features (CI/CD baseline)

- **Multi-runtime support**: Works with Bun, Node.js, and Deno.
- **Universal testing**: Uses [test-anywhere](https://github.com/link-foundation/test-anywhere) for cross-runtime tests.
- **Automated releases**: Changesets-based versioning with GitHub Actions.
- **Code quality**: ESLint + Prettier with pre-commit hooks via Husky.
- **Package manager agnostic**: Works with bun, npm, yarn, pnpm, and deno.
- **Broken link checks**: Automated link validation with [lychee](https://github.com/lycheeverse/lychee-action) and Web Archive fallback suggestions.
- **GitHub Pages publishing**: `pages.yml` deploys the SPA on every push to `main` (this PR).

### Quick Start

```bash
# Install dependencies
bun install

# Run tests
bun test

# Or with other runtimes:
npm test
deno test --allow-read --allow-write --allow-env --allow-net --allow-sys js/tests

# Run the real-browser e2e (opt-in; needs Playwright + Chromium)
RUN_BROWSER_E2E=1 npm run test:e2e:browser

# Run the Rust workspace tests
cargo test --manifest-path rust/Cargo.toml --workspace

# Build the SPA bundle
npm run build:web

# Build the GitHub Pages artifact (writes dist/pages/)
npm run build:pages

# Lint code
bun run lint

# Format code
bun run format

# Check all (lint + format + file size)
bun run check
```

### Design Choices

#### Multi-Runtime Support

This template is designed to work seamlessly with all major JavaScript runtimes:

- **Bun**: Primary runtime with highest performance, uses native test support (`bun test`)
- **Node.js**: Alternative runtime, uses built-in test runner (`node --test`)
- **Deno**: Secure runtime with built-in TypeScript support (`deno test`)

The [test-anywhere](https://github.com/link-foundation/test-anywhere) framework provides a unified testing API that works identically across all runtimes.

#### Package Manager Agnostic

While `package.json` is the source of truth for dependencies, the template supports:

- **bun**: Primary choice, uses `bun.lockb`
- **npm**: Uses `package-lock.json`
- **yarn**: Uses `yarn.lock`
- **pnpm**: Uses `pnpm-lock.yaml`
- **deno**: Uses `deno.json` for configuration

Note: `package-lock.json` is not committed by default to allow any package manager.

#### Code Quality

- **ESLint**: Configured with recommended rules + Prettier integration
- **Prettier**: Consistent code formatting
- **Husky + lint-staged**: Pre-commit hooks ensure code quality
- **File size limit**: Files must stay under 1500 lines for maintainability (enforced via ESLint and CI)

#### Release Workflow

The release workflow uses [Changesets](https://github.com/changesets/changesets) for version management:

1. **Creating a changeset**: Run `bun run changeset` to document changes
2. **PR validation**: CI checks for valid changeset in each PR
3. **Automated versioning**: Merging to `main` triggers version bump
4. **npm publishing**: Automated via OIDC trusted publishing (no tokens needed)
5. **GitHub releases**: Auto-created with formatted release notes

##### Manual Releases

Two manual release modes are available via GitHub Actions:

- **Instant release**: Immediately bump version and publish
- **Changeset PR**: Create a PR with changeset for review

#### CI/CD Pipeline

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
8. **API doc build**: `npm run docs:api` + `cargo doc --manifest-path rust/Cargo.toml --no-deps --workspace`
9. **Broken link checks**: Validates all links in Markdown/HTML files (separate workflow)

**Release** (on merge to main):

10. **Changeset merge**: Combines multiple pending changesets at release time
11. **Release**: Automated versioning and npm publishing
12. **GitHub Pages**: `pages.yml` publishes the SPA bundle (this PR).

##### Reasonable timeouts on every job

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
| GitHub Pages build/deploy  | 10 min   | ~30–60 s                                     |

Per-test timeouts are also enforced inside the runners themselves so
an individual hung promise surfaces in seconds rather than at the job
cap: `node --test --test-timeout=30000` and `bun test --timeout 30000`.

See [BEST-PRACTICES.md](docs/BEST-PRACTICES.md) for detailed explanations of each practice.

##### Robust Changeset Handling

The CI/CD pipeline is designed to handle concurrent PRs gracefully:

- **PR Validation**: Only validates changesets **added by the current PR**, not pre-existing ones from other merged PRs. This prevents false failures when multiple PRs merge before a release cycle completes.

- **Release-time Merging**: If multiple changesets exist when releasing, they are automatically merged into a single changeset with:
  - The highest version bump type (major > minor > patch)
  - All descriptions preserved in chronological order

This design decouples PR validation from the need to pull changes from the default branch, reducing conflicts and ensuring that even if CI/CD fails, all unpublished changesets will still get published when the error is resolved.

#### Broken Link Checker

The link checker workflow (`.github/workflows/links.yml`) validates all links in Markdown and HTML files:

1. **Detection**: Uses [lychee](https://github.com/lycheeverse/lychee-action) to scan all `*.md` and `*.html` files
2. **Web Archive fallback**: For any broken links found, automatically checks the [Wayback Machine](https://web.archive.org) for archived versions
3. **Actionable suggestions**: Reports one of three outcomes for each broken link:
   - **Archived**: Suggests the Web Archive URL as a replacement
   - **Not archived**: Clearly reports the link is unrecoverable
4. **Scheduled checks**: Runs weekly to catch links that break over time (even if no files changed)
5. **Issue creation**: On scheduled runs, creates a GitHub Issue with the full broken links report

Add regex patterns to `.lycheeignore` to exclude URLs from checks (e.g., local dev URLs, example.com, known rate-limited sites).

#### GitHub Pages publishing

The `pages.yml` workflow (added in PR #9 / issue #8) builds `dist/pages/` from `js/src/web/` and deploys it to GitHub Pages on every push to `main`. The workflow uses the official `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages` actions. PRs run a build-only job for early feedback; only `main` and `workflow_dispatch` trigger an actual deploy. See [`docs/case-studies/issue-8/`](docs/case-studies/issue-8/README.md) for the full rationale, and [`js/scripts/build-pages.mjs`](js/scripts/build-pages.mjs) for the build helper.

### Configuration

#### ESLint Rules

Customize ESLint in `js/eslint.config.js`. Current configuration:

- ES Modules support
- Prettier integration
- No console restrictions (common in CLI tools)
- Strict equality enforcement
- Async/await best practices
- **Strict unused variables rule**: No exceptions - all unused variables, arguments, and caught errors must be removed (no `_` prefix exceptions)

#### Prettier Options

Configured in `.prettierrc`:

- Single quotes
- Semicolons
- 2-space indentation
- 80-character line width
- ES5 trailing commas
- LF line endings

### Scripts Reference

| Script                 | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `bun test`             | Run tests with Bun                               |
| `bun run lint`         | Check code with ESLint                           |
| `bun run lint:fix`     | Fix ESLint issues automatically                  |
| `bun run format`       | Format code with Prettier                        |
| `bun run format:check` | Check formatting without changing files          |
| `bun run check`        | Run all checks (lint + format)                   |
| `bun run changeset`    | Create a new changeset                           |
| `bun run build:web`    | Build the production SPA bundle                  |
| `bun run build:pages`  | Build the GitHub Pages artifact in `dist/pages/` |
| `bun run build:mobile` | Build the Capacitor mobile bundle                |

### Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for detailed contribution guidelines.

Quick steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Create a changeset: `bun run changeset`
5. Commit your changes (pre-commit hooks will run automatically)
6. Push and create a Pull Request

### Best Practices

The CI/CD pipeline inherited from `js-ai-driven-development-pipeline-template` covers the practices documented in [BEST-PRACTICES.md](docs/BEST-PRACTICES.md):

- File size limits for AI readability
- Automated formatting and linting
- Multi-runtime and cross-platform testing
- Changeset-based versioning
- Concurrency control for CI/CD pipelines

## License

[Unlicense](LICENSE) - Public Domain
