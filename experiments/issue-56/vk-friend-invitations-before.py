"""Replay actual-parent missing media-choice and native control evidence."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '8f077003',
              'vk-friend-invitations', 'js/tests/vk-wall-media.test.js',
              pattern='optional single-media choice',
              ui='experiments/issue-56/vk-friend-invitations-native.mjs'
              if '--browser' in sys.argv else None)
