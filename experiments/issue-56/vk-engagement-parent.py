"""Reproduce the missing ordered follow-up using exact published source bytes."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], 'd6841cad', 'vk-engagement',
              'js/tests/vk-engagement.test.js', pattern='engagement preset requires',
              ui='experiments/issue-56/vk-engagement-browser.mjs'
              if '--browser' in sys.argv else None)
print('Restored all actual-parent ordered reply sources.')
