# Desktop provider dependency closure

A clean desktop installer generated from `dc876f72` declares only the root
production packages and electron-updater. Browser Commander, Playwright and
teleproto are optional for library consumers, so that manifest omits them even
though the installed product exposes browser automation and Telegram. The
existing runtime validator checks only declared dependencies and never loads
these adapters. Development checkouts hide the omission with their root install.

The new regressions fail six times against that actual parent: three manifest
expectations (provider inclusion, absent-version refusal and retained overrides)
and one missing-provider check for each adapter package. The preserved before
log records the missing entries and the validator advancing past the omission.

Staging now promotes the shared browser package catalog and teleproto to required
production dependencies, using the root constraints. It also preserves root
transitive dependency overrides alongside the existing updater comparator alias.
An absent provider version refuses staging. Development tooling, accessibility
test packages, Electron and unrelated optional peers remain outside that set.
The existing production install prepares the packages before packaging; no new
package manager or runtime download mechanism is introduced.

The staging gate still rejects dependencies resolved outside the app. It now
requires the provider declarations, imports the actual staged browser adapter,
checks both browser packages and loads Telegram through the existing layer and
lazy-session adapter. It starts no server, browser or account connection. Native
provider accelerators retain their portable fallback paths, without a new
cross-platform native source build. The existing desktop workflow performs this
gate after its clean production install on five platform/architecture targets.

The pinned `konard/vk-bot-desktop` package at
`8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1` likewise ships its provider runtime
with the desktop product. Its package response is retained alongside the shared
loader and current packaging sources. This follows the reference's installation
behavior without copying its code.

Local verification is deliberately focused:

```sh
node --test --test-concurrency=1 --test-timeout=30000 js/tests/desktop-packaging.test.js js/tests/desktop-runtime-packaging.test.js
deno test --allow-read --allow-write --allow-env --allow-run --allow-sys --node-modules-dir=manual js/tests/desktop-packaging.test.js js/tests/desktop-runtime-packaging.test.js
node experiments/issue-56/desktop-provider-imports.mjs
```

All 23 checks pass in each runtime. The offline probe loads the real checkout
browser and Telegram adapters with zero launches or account connections; it is
not a clean packaged-install claim. Changed-file lint, format, secret scanning
and the unchanged 6.5% duplication gate pass. No local package installation,
full build, full suite or platform matrix was run. Hosted verification for this
change remains pending until its published commit completes the desktop matrix.

This addresses a VD01 packaging prerequisite. Automatic preparation of remote
runner tools, browser executable availability, backend readiness and authenticated
provider parity remain unfinished. All 60 unchecked inventory rows remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/desktop-provider-packaging.tar.gz) and
[hash manifest](data/desktop-provider-packaging.tar.sha256.json).
