"""Compare all missing contextual presets with actual published source bytes."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent
verify_parent(Path(__file__).resolve().parents[2], 'c930cf39', 'vk-contextual',
              'js/tests/vk-contextual.test.js', pattern='contextual presets expose',
              ui='experiments/issue-56/vk-contextual-browser.mjs'
              if '--browser' in sys.argv else None)
print('Restored all actual-parent contextual reply sources.')
