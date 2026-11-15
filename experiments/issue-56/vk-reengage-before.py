"""Finite actual published-parent capability and native absence probe."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '4bd81d2e', 'vk-reengage',
              'js/tests/vk-reengage-capability.test.js',
              ui='experiments/issue-56/vk-reengage-native.mjs' if '--browser' in sys.argv else None)
