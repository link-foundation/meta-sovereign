# WebKit investigation

PR: https://github.com/link-foundation/meta-sovereign/pull/51

The9161e76e macOS WebKit run passed39/41 browser checks. Selection failed at a blank-area click after resizing1100→2200px. Tutorial intermittently lost its card between a successful step wait and geometry assertion; the card returned with persisted progress and a short event timeline. These are observations, not yet an established shared root cause.

## Evidence and rejected explanations

- Raw job log: ci-logs/webkit-9161e76e.log. Full workflow log: ci-logs/checks-and-release-40777967983-attempt1.log:23099–23117 (selection),23382–23385,23443–23446,23556–23559 (tutorial),23783 (terminal browser failure). Artifact summary and logs are in local/webkit-9161e76e/. Downloaded failure PNGs were checked with file before viewing.
- A native scrollbar can consume the previous border-box click coordinate: experiments/issue50-scrollbar.mjs reproduces this and verifies the client-width correction. However, macOS CI reports clientWidth1648 equal to its border width1648, and still fails after the correction. The experiment is not proof of this failure’s cause.
- A framenavigated event does not establish a document reload. experiments/issue50-webkit-navigation.mjs confirms that ordinary history.pushState preserves the document identity and performance.timeOrigin. Added request/init/unload traces distinguish these cases in CI.
- [Playwright39246](https://github.com/microsoft/playwright/issues/39246) documents native context menus blocking later WebKit clicks even headless on macOS. [30891](https://github.com/microsoft/playwright/issues/30891) explains macOS Control-click context menus. This fixture uses custom menus and Escape, successfully performs several later clicks, and uses no Control modifier before the failure. These reports are leads, not established causes.
- [Playwright43501](https://github.com/microsoft/playwright/issues/43501) establishes stale media queries in cached shadow-tree resolvers after viewport changes. This application uses light-DOM rows, so that reproduction does not match it.
- [Playwright42625](https://github.com/microsoft/playwright/issues/42625) documents retry scroll animation when page CSS uses scroll-behavior:smooth. No such CSS setting exists in this application.

Primary issue bodies and comments are preserved under research/playwright-*.json in the archive. No speculative upstream report was opened. All existing browser checks, assertions and timeout values remain active. Full application tutorial probes exhausted the small local container; their logs are retained as failed experiments, and the full matrix runs on macOS CI.

##1500cb93 diagnostic run

[Checks40780026106](https://github.com/link-foundation/meta-sovereign/actions/runs/40780026106) completed2026-10-28T22:43Z with39/41 WebKit checks passing. Every other Checks gate, all five Desktop targets, Pages and the link workflow passed.

- ci-logs/webkit-1500cb93.log:963–1011 records the selection failure. Mouse-down and mouse-up both reach the expected chat-scroll element at2188,246; no click reaches the document. The scroll area and viewport have matching content/border widths. A bounded app-free input probe and window-capture/product drag tracing now distinguish browser suppression from application suppression.
- Lines1457–1473 establish an actual full tutorial document reload: the extra successful discovery request precedes beforeunload, a document request and a new performance.timeOrigin. Initial discovery had already succeeded; all logged bundle ETags are identical. The failure at line1462 occurs while the new document is mounting; the persisted Backup step then returns. Default-off product diagnostics now label automatic versus manual discovery/build reload callers.
- Failure images were validated as PNG with file and viewed; the phone screenshot shows the restored Backup card. The screenshot alone therefore cannot establish the transient missing-card cause.

Focused local policy tests (offline-client and chat-display) pass29/29; the app-free Linux WebKit probe delivers all four clicks, including2188px. These do not substitute for macOS CI.
