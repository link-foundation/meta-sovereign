"""Reproduce nested secret exposure with the actual parent logger."""
from pathlib import Path
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
verify_parent(root, '77ac37e3e51746f6dd74afef4aec3fd5881c9030', 'diagnostics',
              'js/tests/diagnostics.test.js', pattern='structured logging hides',
              ui='experiments/issue-56/diagnostics-native.mjs')
