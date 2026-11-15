"""Reproduce the absent actual adapter and controls, restoring all sources."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], 'e21ddaa9', 'vk-friends',
              'js/tests/vk-friends.test.js', pattern='VK actual adapter exposes bounded friend',
              ui='experiments/issue-56/vk-friends-native.mjs' if '--browser' in sys.argv else None)
print('Actual-parent friend adapter assertion fails; every production source restored.')
