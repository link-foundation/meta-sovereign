"""Finite actual published-parent capability and native absence probe."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '05bcbddd', 'vk-wall',
              'js/tests/vk-wall-capability.test.js',
              ui='experiments/issue-56/vk-wall-native.mjs' if '--browser' in sys.argv else None)
