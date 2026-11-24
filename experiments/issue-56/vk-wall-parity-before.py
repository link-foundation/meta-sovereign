"""Prove actual-parent absence handling and native control before restoration."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '7fc97ee2',
              'vk-wall-parity', 'js/tests/vk-wall-parity.test.js',
              pattern='successful empty current wall evidence',
              ui='experiments/issue-56/vk-wall-parity-native.mjs'
              if '--browser' in sys.argv else None)
