"""Finite actual-parent CLI admission and native control regression."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '35764037',
              'vk-cache', 'js/tests/vk-cache.test.js',
              pattern='foreground admission exposes',
              ui='experiments/issue-56/vk-cache-native.mjs'
              if '--browser' in sys.argv else None)
