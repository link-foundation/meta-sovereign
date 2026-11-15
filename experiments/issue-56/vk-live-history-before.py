"""Prove the missing first-event native context on the actual published parent."""
from pathlib import Path
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
verify_parent(root, 'aee0a2ec0c2445a0a39c61ac6c4c6cf91f5129f3', 'vk-live-history',
              'js/tests/vk-live-history.test.js',
              pattern='first live trigger observes')
