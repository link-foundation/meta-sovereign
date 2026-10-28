# Actions and toolchain inventory

Registry/API observations captured 2026-10-28. Original pins are from main d48a32f. Every use in all five workflows is covered; action subpaths share their repository release. Raw metadata is in the evidence archive.

| Action | Before | After | Current release / decision |
| --- | --- | --- | --- |
| actions/attest | v4 | v4.2.2 | v4.2.2 |
| actions/cache | v6 | v6.1.0 | v6.1.0 |
| actions/checkout | v7 | v7.0.1 | v7.0.1 |
| actions/configure-pages | v6 | v6.0.0 | v6.0.0 |
| actions/dependency-review-action | v5 | v5.0.0 | v5.0.0 |
| actions/deploy-pages | v5 | v5.0.1 | v5.0.1 |
| actions/download-artifact | v8 | v8.0.2 | v8.0.2 |
| actions/setup-node | v7 | v7.1.0 | v7.1.0 |
| actions/setup-python | new | v7.1.0 | v7.1.0 |
| actions/upload-artifact | v7 | v7.0.2 | v7.0.2 |
| actions/upload-pages-artifact | v5 | v5.0.0 | v5.0.0 |
| denoland/setup-deno | 22d081ff2d3a40755e97629de92e3bcbfa7cf2ed | 22d081ff2d3a40755e97629de92e3bcbfa7cf2ed | v2.0.5 |
| dtolnay/rust-toolchain | b725eda525362e7cf34af9a7243cac1e3f01a7ec | b725eda525362e7cf34af9a7243cac1e3f01a7ec | stable branch at pinned b725eda (toolchain explicitly 1.99.1); v1 is an old compatibility release |
| github/codeql-action | v4 | v4.39.1 | v4.39.1 (action release; codeql-bundle-v2.27.3 is a bundle release) |
| lycheeverse/lychee-action | v2 | v2.9.0 | v2.9.0 |
| oven-sh/setup-bun | 0c5077e51419868618aeaa5fe8019c62421857d6 | 0c5077e51419868618aeaa5fe8019c62421857d6 | v2.2.0 |
| peter-evans/create-pull-request | 5f6978faf089d4d20b00c7766989d076bb2fc7f1 | 5f6978faf089d4d20b00c7766989d076bb2fc7f1 | v8.1.1 |
| taiki-e/install-action | 1e29709c0ec63babbe8f266397a465f29a825f91 | 86f7a0ffb25f40114606501a311ebcfaf882ea32 | v2.88.0 |

| Tool / ecosystem | Before | After | Live latest / source and decision |
| --- | --- | --- | --- |
| Node | engine >=20; CI 24.21.0; Docker 24-alpine | >=26.12.1; all CI and images 26.12.1 | npm registry node latest 26.12.1; 27 alpha excluded |
| npm | runner bundled; minimum 11.5.1 for OIDC | packageManager and CI/image bootstrap 12.2.1 | npm registry latest 12.2.1 |
| Rust | implicit stable; edition 2021; resolver 2 | 1.99.1, edition 2024, resolver 3 | static.rust-lang.org channel-rust-stable.toml |
| Rust local core/server/wasm crates | 0.17.0 | 0.17.0 | Internal path dependencies, no registry releases; zero third-party crates. cargo update yields identical Cargo.lock. |
| Python | runner interpreter, no manifest | CI 3.15.2 | python.org release/python-3152 and CPython v3.15.2; all Python source imports stdlib, no absent third-party manifest |
| Swift | runner/system interpreter, no manifest | CI 6.4.1 | swiftlang/swift latest swift-6.4.1-RELEASE; only Foundation, Security, CryptoKit and Contacts system SDKs |
| Swiftly | absent | 1.2.0 | swiftlang/swiftly latest 1.2.0, official macOS pkg SHA256 a1b48692b00ea6902957423473c87bee7c7f3e18c015a4a09317102f6820b987; replaces broken/deprecated setup-swift action |
| Bun | floating latest | 1.4.4 | oven-sh/bun latest bun-v1.4.4 |
| Deno | floating v2.x | 2.9.8 | denoland/deno latest v2.9.8 |
| zizmor | 1.30.1 | 1.31.1 | PyPI version metadata; exact tool pin |
| cargo-audit | 0.22.2 | 0.22.2 | crates.io max stable 0.22.2; no RustSec advisories in project lock |
| actionlint | 1.7.12 image sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 | same digest | GitHub v1.7.12 and Docker registry current digest; narrow current-label config pending upstream #682 |
| ShellCheck | provided by actionlint image | current image, ShellCheck 0.11.0 | koalaman/shellcheck latest v0.11.0; shares the verified image digest above |
| lychee checker | action default | 0.24.2 via current action | lycheeverse/lychee latest lychee-v0.24.2; action release v2.9.0 selects this version |
| Node Docker image (both services) | node:24-alpine, floating | node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 | Docker Hub current manifest list; both copies identical; npm lock install failure no longer silently falls back |
| Compose | two local Dockerfile build contexts | same services, current bases | No external compose image pins or remote dependencies |
| Linux hosted runners | Ubuntu 24.04 x64/ARM | Ubuntu 26.04 x64/ARM | runner-images generally available labels; security sandbox setup preserved |
| macOS hosted runners | macOS 15 ARM / 15 Intel | macOS 26 ARM / 26 Intel | current GA runner-images; Xcode 27 label is preview, excluded |
| Windows hosted runners | Server 2025 x64 / Windows 11 ARM | Server 2025 x64 / Windows 11 VS2026 ARM | current GA runner-images labels |
| CSS, HTML, Shell | npm-owned tooling | npm inventory | No independent package managers or CDN dependencies introduced |

## Version channels and retained upstream constraints

Root npm declarations and every transitive/optional/native lock entry are in [NPM.md](NPM.md). `npm update` refreshes compatible lock entries after npm-check-updates changes declarations, including peers that ncu skips by default. Parent-owned incompatible ranges are recorded individually rather than overridden across unknown API/ABI boundaries. Electron-builder 27 alpha is deliberately newer than stable 26 and avoids its deprecated dependency chain. Electron-updater uses registry `latest` 6.8.11; the alternate v26 channel publishes 6.8.12, while next 7 alpha still carries lodash.isequal. The project follows the declared latest channel, with the existing tested scoped alias until upstream #10016 ships a replacement. No security finding justifies a forced incompatible override.
