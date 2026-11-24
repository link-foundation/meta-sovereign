"""Finite actual-parent admission and native control regression."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '8c304933',
              'vk-stickers', 'js/tests/vk-stickers.test.js',
              pattern='foreground admission exposes',
              ui='experiments/issue-56/vk-stickers-native.mjs'
              if '--browser' in sys.argv else None)
