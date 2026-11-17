#!/usr/bin/env bash
# Extracted unchanged from the mandatory documentation validation job.
set -e
REQUIRED_FILES=(
  "docs/BEST-PRACTICES.md"
  "docs/CONTRIBUTING.md"
  "docs/ROADMAP.md"
  "docs/REQUIREMENTS.md"
  "README.md"
  "CHANGELOG.md"
)

MISSING=()
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "ERROR: Required documentation file missing: $file"
    MISSING+=("$file")
  else
    echo "Found: $file"
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo ""
  echo "Missing required documentation files:"
  printf '  %s\n' "${MISSING[@]}"
  exit 1
else
  echo "All required documentation files present."
fi
