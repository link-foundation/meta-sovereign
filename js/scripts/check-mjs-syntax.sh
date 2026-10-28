#!/usr/bin/env bash
# Check tracked JavaScript recursively.
set -euo pipefail
checked=0
while IFS= read -r -d '' file; do
  case "$file" in
    dev/log/*|docs/case-studies/*|*.min.js) continue ;;
    *.js|*.mjs|*.cjs)
      node --check "$file"
      checked=$((checked + 1))
      ;;
  esac
done < <(git ls-files -z --cached)
if [ "$checked" -eq 0 ]; then
  echo 'No tracked JavaScript found' >&2
  exit 1
fi
echo "Syntax checked $checked JavaScript files"
