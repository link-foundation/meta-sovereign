"""Check actual-parent snapshot I/O and issued-copy ownership regressions."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2],
              '4916921f', 'release-copy', 'js/tests/rolling-release-copy.test.js')
