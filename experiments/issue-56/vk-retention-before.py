"""Finite regression against the actual published parent."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], '3ea98ecc', 'vk-retention',
              'js/tests/vk-retention-capability.test.js',
              ui='experiments/issue-56/vk-retention-native.mjs' if '--browser' in sys.argv else None)
