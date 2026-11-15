"""Prove the actual published parent lacks follow-up review and controls."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], 'b0bb53ae', 'vk-cancelled',
              'js/tests/vk-cancelled-capability.test.js',
              ui='experiments/issue-56/vk-cancelled-native.mjs' if '--browser' in sys.argv else None)
print('Parent lacks friendship follow-up; all production sources restored.')
