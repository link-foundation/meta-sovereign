#!/usr/bin/env bash
set -euo pipefail
cd "${1:-dist/desktop/release}"

check_app() {
  local app="$1" id
  ls -la "$app/Contents"
  test "$(basename "$app")" = 'Meta Sovereign.app'
  id=$(plutil -extract CFBundleIdentifier raw -o - "$app/Contents/Info.plist")
  echo "$app: $id"
  test "$id" = foundation.link.meta.sovereign
  codesign --verify --deep --strict --verbose=2 "$app"
}

check_image() (
  local mounted_dir
  mounted_dir=$(mktemp -d)
  # shellcheck disable=SC2329 # Invoked indirectly by this image's EXIT trap.
  cleanup() {
    local status="$?" attempt
    trap - EXIT
    # Only this owned read-only test image may be detached. A short-lived
    # macOS background reader can keep it busy after codesign returns.
    for attempt in 1 2 3; do
      if hdiutil detach "$mounted_dir" > /dev/null; then
        rmdir "$mounted_dir"
        return "$status"
      fi
      if [[ "$attempt" != 3 ]]; then sleep 1; fi
    done
    echo "Normal detach remained busy; releasing owned test image: $mounted_dir" >&2
    if hdiutil detach -force "$mounted_dir" > /dev/null; then
      rmdir "$mounted_dir"
      return "$status"
    fi
    echo "::error::Unable to release owned test image: $mounted_dir" >&2
    return 1
  }
  hdiutil attach "$1" -nobrowse -readonly -mountpoint "$mounted_dir"
  trap cleanup EXIT
  ls -la "$mounted_dir"
  check_app "$(find "$mounted_dir" -maxdepth 1 -name '*.app' | head -n 1)"
)

ls -la
for dir in mac mac-arm64; do
  ls -la "$dir"
  check_app "$(find "$dir" -maxdepth 1 -name '*.app' | head -n 1)"
done
for dmg in meta-sovereign-desktop-macos-*.dmg; do
  check_image "$dmg"
done
test -f latest-mac.yml
