# CI and release diagnosis (languages: en • [zh](CI-OPERATIONS.zh.md) • [hi](CI-OPERATIONS.hi.md) • [ru](CI-OPERATIONS.ru.md))

R-Z32 requires observable checks and publication of the source that passed them. The [issue 43 investigation](case-studies/issue-43/README.md) links the original evidence and template comparison.

## Local checks and CI coverage

Use `npm ci` and run only changed-file linting and the relevant test files locally, with `--test-concurrency=1`. Push the branch for the complete Node/Bun/Deno and operating-system matrix, Chromium, native macOS WebKit, Rust and desktop packaging. Tests own temporary stores and fixture servers; keep a user's running application separate.

The browser manifest is `js/scripts/browser-checks.json`. Both engines run the same representative suites, including recovery. A missing requested browser, failed suite or deadline fails the job. Browser diagnostics are uploaded after the runner starts; an earlier merge/install error remains the primary failure.

The 200k-link backup regression runs only in its dedicated CI job with `RUN_BACKUP_STRESS=1` and a 384 MiB V8 heap limit. Ordinary unit runs skip it. Do not run the stress probe on the user's machine.

## Read a failing run

Match the run's timestamp and head SHA to the latest branch commit before diagnosing it. Preserve logs with `gh run view RUN_ID --log > run.log`, inspect the actual failing step, and distinguish a failed assertion, a refused API request, a missing report and a superseded run. `experiments/issue43-runs.py` preserves the investigation's runs and annotations.

Package checks separate cold-cache installation from startup and preserve `artifacts/pack/`, including npm logs and the child's last output. Browser checks preserve per-suite logs and `summary.json` under `artifacts/browser/`. A failed source link remains a failure even when Wayback has a copy; repair the source URL. A missing or malformed checker report also fails.

Optional diagnostics are off by default:

- Set repository variable `CI_BROWSER_DEBUG=1` for Playwright API traces in CI.
- Set `CISCRIPTS_DEBUG=1`, or enable GitHub runner/step debugging, for CI helper export/loading details.
- Set `PACK_SMOKE_VERBOSE=1` for package install/start diagnostics.

Use fixture data for verbose probes. Never log session strings, tokens, user messages or credentials.

## Publication prerequisites and recovery

The publishing jobs wait for the terminal pipeline gate. Read-only checks cancel superseded runs; release writes are serialized without cancellation. Before versioning or publishing, the tree guard allows only version/changelog/changeset metadata to advance beyond the validated commit. New source or dependency edits require a new validated run.

Trusted npm publishing needs Node 24's bundled npm (at least 11.5.1), `id-token: write`, and a trusted publisher for `link-foundation/meta-sovereign`, workflow `release.yml`. A package administrator must bootstrap the package/publisher in npm when needed. Never replace a refused token exchange with an unchecked publish attempt.

Enable **Settings → Security → Code security → Dependency graph** for dependency review. Capability absence is reported on PRs without requiring contributor secrets. On `main`, missing dependency graph or npm publisher configuration fails preflight with explicit setup guidance before expensive builds. Network, authentication and malformed API responses remain errors.

Registry probes recognize only an exact version response or an explicit npm E404/GitHub 404. Other failures are unknown. Publication retries only known transient transport/server errors within one shared deadline. A staged version is checked for visibility without another upload; permission/policy refusals fail immediately. A published npm version with no GitHub release can recover the GitHub release and documentation without publishing npm again.

## Dependency policy

Committed manifests and lockfiles pin release helpers. The Telegram integration uses the maintained `teleproto` client with its compatibility layer; its public provider identity remains `telegram`. KaTeX is patched. Reviewed native install scripts are explicitly approved for npm, Bun and Deno.

Electron-builder is pinned to `27.0.0-alpha.13` because the 26.x dependency tree still contains deprecated packages. This is a prerelease build-tool dependency and requires all native packaging targets to pass CI; runtime package engines are unchanged. Keep upstream warnings visible, avoid incompatible major overrides, and update the pin only with packaging evidence. The lockfile regression rejects deprecated registry entries.

The v27 builder configuration preserves the same packaged files, native-module policy, desktop entry and macOS entitlements under the new schema. Ad-hoc signing uses `mac.sign.identity` and `mac.sign.sign`. The existing updater-6 channel retains unsigned update manifests and unsigned Windows artifacts explicitly; Windows Authenticode verification requires a configured signing publisher before it can be enabled. The staged updater scopes an exact npm alias from deprecated `lodash.isequal` to `lodash.isequalwith@4.4.0`. Without a customizer both methods perform the same boolean deep comparison. Every installed desktop stage verifies the actual updater cache against cloned and changed metadata and missing files. Remove this compatibility override when upstream ships its replacement; aliasing the entire `lodash` package would return a wrapper and is unsafe.

Windows Deno selects cifrante’s existing WASM AES backend before Telegram initialization: native IGE construction with cifrante 0.6.0 crashes Deno 2.9.8 with access violation `0xC0000005`. Other runtime/platform selections remain intact. The bounded `experiments/issue43-cifrante.mjs` checks the application path and portable round trips; `--raw-native` explicitly reproduces the native failure. `CI_CRYPTO_DIAGNOSTICS=1` enables test stage tracing and is off by default. No runtime or crypto assertion is skipped.

Desktop, registry, mobile and package-smoke commands share exact-pinned `cross-spawn@7.0.6` to resolve Windows npm/npx shims and escape arguments. Raw argument arrays with Node’s `shell: true` cause DEP0190; the shared launcher uses `shell: false` and preserves command failures. Regression tests run npm/npx with `--throw-deprecation` and check literal arguments and exit codes.
