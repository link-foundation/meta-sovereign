"""Reproduce the published parent's lost desktop choice and absent control."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], 'f2cf0d6e', 'vk-desktop',
              'js/tests/vk-desktop-policy-settings.test.js',
              ui='experiments/issue-56/vk-desktop-native.mjs' if '--browser' in sys.argv else None)
print('Parent drops desktop policy; all production sources restored.')
