#!/usr/bin/env bash
# Finite synthetic tools for the actual macOS package-verification script.
case "$(basename "$0")" in
  plutil) echo foundation.link.meta.sovereign ;;
  codesign)
    if [[ "$*" == *"/mounted/"* && "${FAIL_VERIFY:-0}" == 1 ]]; then exit 7; fi ;;
  sleep) exit 0 ;;
  mktemp) mkdir -p "$PROBE_ROOT/mounted"; echo "$PROBE_ROOT/mounted" ;;
  hdiutil)
    echo "$*" >> "$PROBE_ROOT/commands"
    if [[ "$1" == attach ]]; then
      mkdir -p "$PROBE_ROOT/mounted/Meta Sovereign.app/Contents"
      exit 0
    fi
    count=$(cat "$PROBE_ROOT/count" 2>/dev/null || echo 0)
    count=$((count + 1)); echo "$count" > "$PROBE_ROOT/count"
    if [[ "${DETACH_MODE:-transient}" == permanent ||
          ( "${DETACH_MODE:-transient}" == force && "$*" != *-force* ) ||
          ( "${DETACH_MODE:-transient}" == transient && "$count" == 1 ) ]]; then
      echo 'hdiutil: Resource busy' >&2; exit 16
    fi
    rm -rf "$PROBE_ROOT/mounted/Meta Sovereign.app"
    ;;
esac
