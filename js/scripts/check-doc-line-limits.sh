#!/usr/bin/env bash
# Extracted unchanged from the mandatory documentation validation job.
set -e
LIMIT=2500
FAILURES=()

echo "Checking that documentation files are under ${LIMIT} lines..."

while IFS= read -r -d '' file; do
  line_count=$(wc -l < "$file")
  if [ "$line_count" -gt "$LIMIT" ]; then
    echo "ERROR: $file has $line_count lines (limit: ${LIMIT})"
    echo "::error file=$file::Documentation file has $line_count lines (limit: ${LIMIT})"
    FAILURES+=("$file")
  fi
done < <(find docs -name "*.md" -type f -print0 2>/dev/null)

if [ "${#FAILURES[@]}" -gt 0 ]; then
  echo "The following docs exceed the ${LIMIT} line limit:"
  printf '  %s\n' "${FAILURES[@]}"
  exit 1
else
  echo "All documentation files are within the ${LIMIT} line limit."
fi
