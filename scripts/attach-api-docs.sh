#!/usr/bin/env bash
# attach-api-docs.sh
#
# Bundle the freshly built API documentation (`docs/api/` for the JS
# modules and `target/doc/` for the Rust crates) and upload them as
# release assets to the GitHub Release identified by the supplied tag.
#
# Usage: bash scripts/attach-api-docs.sh <tag>
# Requires: gh CLI authenticated, GH_TOKEN env var set.

set -euo pipefail

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "ERROR: tag argument required" >&2
  echo "Usage: bash scripts/attach-api-docs.sh <tag>" >&2
  exit 1
fi

JS_DOCS_TARBALL="meta-sovereign-js-api-docs-${TAG}.tar.gz"
RUST_DOCS_TARBALL="meta-sovereign-rust-api-docs-${TAG}.tar.gz"

if [ -d docs/api ]; then
  tar -czf "$JS_DOCS_TARBALL" -C docs api
  echo "Bundled $JS_DOCS_TARBALL"
else
  echo "WARNING: docs/api/ not present, skipping JS docs upload" >&2
fi

if [ -d target/doc ]; then
  tar -czf "$RUST_DOCS_TARBALL" -C target doc
  echo "Bundled $RUST_DOCS_TARBALL"
else
  echo "WARNING: target/doc/ not present, skipping Rust docs upload" >&2
fi

ASSETS=()
[ -f "$JS_DOCS_TARBALL" ] && ASSETS+=("$JS_DOCS_TARBALL")
[ -f "$RUST_DOCS_TARBALL" ] && ASSETS+=("$RUST_DOCS_TARBALL")

if [ "${#ASSETS[@]}" -eq 0 ]; then
  echo "ERROR: no doc tarballs to upload" >&2
  exit 1
fi

echo "Uploading ${#ASSETS[@]} asset(s) to release $TAG..."
gh release upload "$TAG" "${ASSETS[@]}" --clobber
echo "Attached API docs to release $TAG"
