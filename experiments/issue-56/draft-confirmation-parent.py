"""Reproduce changed stored drafts on the actual parent, then restore sources."""
from pathlib import Path
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
verify_parent(root, '3cd0d746', 'draft-confirmation',
              'js/tests/draft-confirmation.test.js', pattern='freezes stored')
print('Restored all actual-parent draft confirmation sources.')
