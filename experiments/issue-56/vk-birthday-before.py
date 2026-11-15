"""Actual published-parent birthday capability and native absence probe."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], '3badd29a', 'vk-birthday',
              'js/tests/vk-birthday-capability.test.js',
              ui='experiments/issue-56/vk-birthday-native.mjs' if '--browser' in sys.argv else None)
