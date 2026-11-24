"""Verify the missing preset against the exact published production sources."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], 'e56d8854', 'vk-acquaintance',
              'js/tests/vk-acquaintance.test.js', pattern='preset recognizes whole',
              ui='experiments/issue-56/vk-acquaintance-browser.mjs'
              if '--browser' in sys.argv else None)
print('Restored the actual-parent acquaintance comparison sources.')
