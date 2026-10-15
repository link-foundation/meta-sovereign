---
'meta-sovereign': patch
---

The Rust crates (`meta-sovereign-core`, `meta-sovereign-server`,
`meta-sovereign-wasm`) are marked `publish = false`: they are the app's
server and WebAssembly build, not libraries for crates.io, so
`cargo publish` refuses them and registry scans stop listing them.
