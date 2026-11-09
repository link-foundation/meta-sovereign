# Dependency and transport audit

Related work: <https://github.com/link-foundation/meta-sovereign/pull/57>.

The audit reads primary npm registry metadata for every direct dependency, optional dependency, development dependency, peer dependency and explicit override. It retains the project's existing prerelease channel for Electron Builder (`next`); blindly following `latest` would downgrade 27.x to 26.x. Reference overrides follow their direct dependency. `experiments/issue-56/dependency-audit.mjs` reproduces the audit sequentially.

The initial results are preserved in `data/dependencies-2026-11-09.json`. They identify updates to Links Notation, the object codec, browser-commander, Playwright, Teleproto, Electron, Electron Builder, ESLint, jscpd, lino-arguments, glob and minimatch. The required default transport dependency, lino-rest-api, is added at the newest published version, 0.2.1; the pinned GitHub main manifest says 0.2.2, which is not yet published. Adding the dependency alone does not satisfy the transport requirement.

`data/tools-2026-11-09.json` records primary release sources for each CI action and runtime, npm, cargo-audit, zizmor, Swiftly and the Docker manifest digest. It distinguishes CodeQL action tags from the independently released CodeQL bundle. Python's FTP directories also contain prereleases: the audit uses published, non-prerelease release metadata instead of treating the newest directory as stable. Node's supported minimum remains unchanged; CI and containers use the newest stable release.

The update refreshes the resolved lockfile with installation scripts disabled locally. Parser and object-codec reference overrides avoid retaining older incompatible copies under the associative stack's dependencies. This needs focused storage, pattern and browser regression checks plus the existing CI matrices; it is not evidence that all requested stack integrations are finished.

## Binary transport experiment

`experiments/issue-56/lino-binary-probe.mjs` is bounded to a 128 MiB heap, a 1 MiB stack and finite binary graph limits. It verifies that typed object-codec ASTs round-trip through the current BinaryLinoCodec, including empty collections/strings, Unicode, numeric-looking strings and nested values. It also records an unsuccessful alternative: generic parsing/printing of readable object text does not preserve its indentation semantics. The binary adapter must preserve the typed tree and unary containers.

The published Lino REST codec rejects binary media types. A separate minimal check confirms that its content negotiator selects `text/lino` for `text/lino;q=0, */*;q=1` when that is the only supported format, violating the explicit exclusion. Upstream reports [binary transport #10](https://github.com/link-foundation/lino-rest-api/issues/10) and [negotiation #11](https://github.com/link-foundation/lino-rest-api/issues/11) include reproductions, observed versions, local adapter approaches and suggested tests. Their source bodies are retained under `experiments/issue-56/`. Neither report completes the local transport acceptance criterion.

## Focused validation

After updating the lockfile and sharing parser/codec versions, 24 focused storage, pattern, browser-policy launch and release-lockfile tests passed with one test process and a 384 MiB heap limit. The bounded binary probe passed both typed round-trips. The web bundle rebuilt in 1.1 seconds. Changed JavaScript passed ESLint and formatting. Full runtime, browser and native/container builds remain assigned to existing CI for the pushed commit.
