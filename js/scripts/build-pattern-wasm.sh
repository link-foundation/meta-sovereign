#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cargo build \
  --manifest-path "$repo_root/rust/Cargo.toml" \
  -p meta-sovereign-wasm \
  --target wasm32-unknown-unknown \
  --release

cp \
  "$repo_root/rust/target/wasm32-unknown-unknown/release/meta_sovereign_wasm.wasm" \
  "$repo_root/js/src/web/pattern-matcher.wasm"
