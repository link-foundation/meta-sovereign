"""Finite actual-parent reply pacing and missing controls regression."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '5155e22b',
              'vk-queue', 'js/tests/vk-queue-runner.test.js',
              pattern='reviewed reply reads',
              ui='experiments/issue-56/vk-queue-native.mjs'
              if '--browser' in sys.argv else None)
