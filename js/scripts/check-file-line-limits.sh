#!/usr/bin/env bash
# Check every tracked source/helper/workflow; ignore immutable evidence and bundles.
set -euo pipefail
failures=0
checked=0
while IFS= read -r -d '' file; do
  case "$file" in
    dev/log/*|docs/case-studies/*|*.min.js) continue ;;
    *.js|*.mjs|*.cjs|*.rs|*.py|*.sh|*.swift|.github/workflows/*.yml|.github/workflows/*.yaml)
      lines=$(awk 'END { print NR }' "$file")
      checked=$((checked + 1))
      if [ "$lines" -gt 1500 ]; then
        echo "::error file=$file::File has $lines lines (limit 1500). Extract a focused module."
        failures=$((failures + 1))
      fi
      ;;
  esac
done < <(git ls-files -z --cached)
if [ "$checked" -eq 0 ]; then echo 'No tracked sources found' >&2; exit 1; fi
echo "Checked $checked source/workflow files; $failures over the 1500 line limit"
[ "$failures" -eq 0 ]
