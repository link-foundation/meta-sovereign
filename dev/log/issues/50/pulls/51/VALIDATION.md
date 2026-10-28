# Validation evidence

Source and workflow changes are in [PR 51](https://github.com/link-foundation/meta-sovereign/pull/51). This report distinguishes completed checks from pending verification. Updated after the final CI review.

## Focused local verification

AGENTS.md prohibits full local suites, stress probes and browser/runtime matrices. Those run on GitHub; local commands use focused targets, one test worker, and Rust jobs=1 with reduced debug information. Screenshots use an isolated ephemeral-port fixture, never the user's running server.

| Check | Evidence / result |
| --- | --- |
| Mobile CLI regression | mobile-before.log reproduces 7.6.2 versus declared peer; mobile-after.log and fixtures-after.log pass current peer invocation. |
| npm12 registry JSON regression | npm12-registry-before.log fails on a single-element array; npm12-after.log passes the normalizer and invalid response cases. |
| Browser sandbox regression | sandbox-before.log fails on missing namespace setup; sandbox-after.log passes setup ordering and Linux condition. |
| Chromium fixture installation regression | browser-install-before.log fails on WebKit-only installation; fixtures-after.log: 17 focused tests pass. |
| Mobile fixture across test runtimes | mobile-deno-after.log passes the same regression using the explicitly Node-based production launcher. Windows Deno before failure is preserved in pr-deno-windows-current.log:5939–5956. |
| Documentation, generated assets and launcher tests | docs-focused.log, focused-tests.log, web-build.log and docs-build.log record focused checks and successful web/API builds. |
| Rust migration | wasm-test.log, rust-email-after.log and rust-clippy-fix.log record focused tests and strict Clippy; full workspace fmt/clippy/test is required in CI. Cargo.lock remains byte-identical after cargo update (zero external crates). |
| Workflow lint | fixtures-actionlint.log passes actionlint1.7.12; latest zizmor audit and workflow contract logs record no unresolved findings. |
| npm security and install consistency | npm-audit.json: zero vulnerabilities; npm-tree.json: consistent dependency tree. A separate lock-only resolution audits all 118 optional native/mobile peer entries with the actual updater override: optional-peer-audit.json also has zero vulnerabilities, and optional-peer-lock.json contains zero deprecated packages. No native install scripts execute. Root lock deprecation contract remains mandatory. |
| Visual runtime instructions | [before](local/node-before.png), [after](local/node-after.png); screenshot script asserts expected text and zero page errors, then closes the browser and fixture. |
| Native scrollbar fixture | scrollbar-repro.log reproduces the border-box click miss and verifies the client-width coordinate. webkit-selection-before.log and webkit-selection-after.log pass the focused actual app test. Playwright MCP Chromium uses an overlay scrollbar here; both coordinates click content, confirming the platform difference (scrollbar-mcp.txt and screenshots). |
| Navigation lifetime regression | server-follow-before.log reproduces delayed discovery and a retry surviving navigation. server-follow-after.log passes 28 focused discovery/offline/lifetime tests. Manual “Check again” regression also fails first (manual-discovery-before.log); manual-discovery-after.log passes 19 web-mode/lifetime tests after guarding that path. Active-document build reloads and persisted bfcache suspension remain covered. |
| Actual blank-gutter selection | selection-gutter-after.log passes the complete focused Linux WebKit selection scenario, including 2200/1100/390px checks. macOS verification is tracked separately below. |
| Event-stream ownership and native diagnostics | server-events-before.log and eventsource-diagnostic-before.log reproduce missing stream cleanup and misclassified EventSource cancellation. eventsource-after.log passes30 focused tests, including genuine-error/origin/engine boundaries. eventsource-navigation.log is an actual app-free browser contrast; media-loading-after.log passes the full focused WebKit media scenario. |
| Swift compiler selection | native-swift-9161e76e.log:295–308 asserts and prints the actual selected Apple Swift6.4.1 compiler, then successfully typechecks both production helpers. |

Log filenames are listed exactly in evidence-files.sha256; raw logs and registry/GitHub responses are retained in evidence.tar.gz. See README for restoration commands.

## CI investigation

Main SHA d48a32f5c1f6c5e86cb04c534b21b43d4660eda2 is an ancestor of this branch. The original [main Checks run](https://github.com/link-foundation/meta-sovereign/actions/runs/40765563701) failed at repository dependency-graph capability preflight (main-checks-40765563701.log:175,204; HTTP403), rather than at a test. Enabling repository vulnerability alerts restored the dependency comparison endpoint to HTTP200. A full rerun then exercised every gate.

That rerun passed nine runtime/OS unit-test lanes, Rust, CodeQL, security, pack consumer and documentation, but exposed both browser setup omissions fixed here: Chromium's AppArmor user-namespace requirement (main-chromium-rerun.log:973–975) and the WebKit lane's missing Chromium Pages fixture (main-checks-rerun-complete.log:34259–34276). Those source repairs require integration through PR 51 before main can exercise them. PR checks must pass first; default-branch success must then be verified independently.

PR iterations also exposed and repaired ten edition2024 Clippy let-chain lints, published setup-swift2.4.0 rejecting current Swift6.4.1/using deprecated Node20, a new contact-helper compiler invocation missing the existing production parse mode, and the Windows Deno test fixture invoking Deno without its permission flags. No test, browser, runtime or desktop platform was skipped to repair these failures.

The old-head [link check](https://github.com/link-foundation/meta-sovereign/actions/runs/40769379486) encountered Google Help HTTP429 (pr-links-40769379486.log:405,426); the exact source URL returned HTTP200 from this investigation, and attempt2 passed unchanged. No ignore entry or weaker failure policy was added.

The b835bacc [Checks run](https://github.com/link-foundation/meta-sovereign/actions/runs/40772001680) passed all nine runtime/OS suites, Rust, CodeQL, security, package consumer, native/container and Chromium gates. WebKit passed39 of41 checks but failed selection and tutorial (checks-b835bacc-complete.log:29395–29399,29496–29513). Raw logs, summary and downloaded valid PNG artifacts are preserved. The native-scrollbar experiment demonstrates a fixture defect, but the first clientWidth correction alone did not repair macOS overlay-scrollbar input. Subsequent eaa04f3e traces identified stale rediscovery reloading the tutorial document; [WEBKIT.md](WEBKIT.md) records the exact event sequence, regression tests and fixes.

The9161e76e Checks run also passed every gate except WebKit (39/41 checks); raw webkit-9161e76e.log and its artifact logs preserve the repeat selection failure and three transient missing tutorial cards. Those historical failures are retained alongside the later root-cause evidence. All five desktop targets, Pages and links passed at that head.

Both full desktop packaging and Pages passed at b835bacc. Its first link attempt saw transient X developer docs HTTP503; the exact URL returned HTTP200 and attempt2 passed unchanged. Both attempts are preserved. The current9161e76e Pages and link workflows have also passed.

Local tutorial tracing with full application rendering exhausted the container’s small memory budget; stopped probe processes and retained logs/memory counters. Those attempts are not verification. Further full tutorial validation runs on the adequately provisioned macOS CI runner. The small navigation experiment confirms that ordinary history.pushState alone preserves WebKit’s document and timing origin; it does not establish the cause of the macOS tutorial failure.

## Latest PR verification

The8c347992 head passes selection and the complete tutorial on macOS WebKit, nine runtime/OS suites, Chromium, Rust, CodeQL, security, native/container, package and documentation gates. Its [Checks run40786024399](https://github.com/link-foundation/meta-sovereign/actions/runs/40786024399) still fails because WebKit media-loading encounters a native EventSource navigation-cancellation diagnostic (webkit-8c347992.log:1808). [Desktop40786024404](https://github.com/link-foundation/meta-sovereign/actions/runs/40786024404), [Pages40786024534](https://github.com/link-foundation/meta-sovereign/actions/runs/40786024534) and [links40786024507](https://github.com/link-foundation/meta-sovereign/actions/runs/40786024507) pass. See WEBKIT.md for the demonstrated diagnostic classification and subsequent cleanup/policy regression fixes.

Full final-head Checks, Pages, link checker and all five desktop packaging targets remain required. Results must match the latest pushed SHA and follow its commit timestamp. Pending jobs are not represented as passing. After successful integration through PR51, verify default-branch workflows independently and link their exact SHA/run results from the PR.
