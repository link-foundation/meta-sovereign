"""Finite regression against the published retention parent."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], 'aae37f2d', 'vk-discovery',
              'js/tests/vk-discovery-capability.test.js',
              ui='experiments/issue-56/vk-discovery-native.mjs' if '--browser' in sys.argv else None)
