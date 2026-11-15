"""Actual published parent must lack the adapter and both reviewed controls."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], '4dca9462', 'vk-maintenance',
              'js/tests/vk-maintenance.test.js', pattern='VK actual adapter exposes bounded maintenance',
              ui='experiments/issue-56/vk-maintenance-native.mjs' if '--browser' in sys.argv else None)
print('Parent lacks maintenance adapter/controls; all production sources restored.')
