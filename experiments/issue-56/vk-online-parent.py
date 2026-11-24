"""Reproduce the absent actual adapter and controls, then restore every source."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '9e934842', 'vk-online',
              'js/tests/vk-online.test.js', pattern='VK actual adapter confirms only',
              ui='experiments/issue-56/vk-online-native.mjs'
              if '--browser' in sys.argv else None)
print('Actual-parent VK adapter fails the missing online refresh assertion; all sources restored.')
