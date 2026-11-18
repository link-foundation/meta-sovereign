# First-use managed browser preparation

The pinned desktop reference README promises automatic local dependencies on first launch. Its main process forks bundled provider code. Browser Commander resolves Chrome for Testing from Playwright's executable/cache locations; when absent, it requests a manual Playwright installation. Shipping provider packages alone therefore leaves an executable preparation gap.

Shared explicit browser launches now check the installed Playwright version's Chromium executable. A missing executable invokes that version's public CLI through the current runtime, with `ELECTRON_RUN_AS_NODE=1` for packaged Electron. The process works from a real temporary directory because an Electron `app.asar` directory cannot serve as a child working directory. It installs Chromium without the separate headless shell, progress output or removing other cached browsers. It does not invoke npx, install packages, run sudo or change system libraries.

The existing bounded command transport caps output at 64 KiB, enforces a five-minute installer deadline and waits for callback and child close, escalating termination after cancellation. Concurrent in-process callers share preparation; cancelling one leaves other owners intact, and cancelling the last waits for installer drainage. File/executable readback is required before launch. Failures permit a later explicit retry and expose a fixed recovery message without child diagnostics or private proxy values. `MS_BROWSER_PREPARATION_DEBUG=1` emits fixed phases only and is off by default.

Regular CV/assignment/jobs launches, persistent form sessions and managed auto-import launches use the shared preparation. Auto-import retains explicit executable/channel/CDP selections. Existing exact-target watcher connections never install a replacement browser. Assignment stop/deadline, form closure, manual login shutdown and auto-import stop/shutdown pass their owned signal into startup and await its completion. A stopped auto-import launch cannot overwrite the terminal state with a later preparation failure. Availability probes remain read-only.

Finite reproductions, without any network or real browser download:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 --test-name-pattern='first launches prepare before opening' experiments/issue-56/browser-preparation-parent.mjs
node --max-old-space-size=384 --test --test-concurrency=1 experiments/issue-56/browser-preparation-owners-parent.mjs
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/browser-preparation.test.js js/tests/browser-preparation-owners.test.js
```

The exact published parent `af27bb6d591e0b8d0149750ae57e96eaf806c0b2` fails both preparation-order regressions and all six cancellation propagation regressions. Current code passes 18 focused checks, 92 existing compatibility checks, the three auto-import manager checks after the final helper extraction and the direct CV launch control. Local process tests use a tiny executable fixture and actually execute the installer process boundary. Ownership tests hold cancellation acknowledgement until explicit release. A caller that sees an executable appear while installation is still active also waits for installer closure.

One hosted Chromium shard additionally runs `browser-preparation-native.mjs` under Xvfb with an isolated, initially empty browser cache. The actual headed shared launcher must download its own executable, render a finite local data page, reuse the executable without changing its modification time, close the browser and remove its private profile. Logs and a screenshot are retained as browser artifacts. This cold-cache proof is CI-only; no real download is run locally. Its hosted result remains required before claiming native verification.

The independently hashed [evidence archive](data/browser-preparation.tar.gz) preserves sources, exact-parent failures, focused results, reference material and static checks. The previous parent `431935dc` macOS binary timeout is also retained: job `134798721101`, log lines 7153–7155, ten-second deadline with the unchanged 101-description input. The separate binary-layout correction is `af27bb6d`; its complete exact-source hosted checks remain required.

This change does not accept VD01: remote runner tools, operating-system prerequisites and complete automatic dependency preparation remain unfinished. It makes no authenticated provider or full-desktop dependency claim. Inventory remains **88 verified / 30 unfinished**. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft and unmerged while every unfinished requirement is pursued.
