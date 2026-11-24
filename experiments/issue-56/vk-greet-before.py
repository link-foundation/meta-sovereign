"""Finite published-parent absence and native before screenshot probe."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '07d3159e', 'vk-proactive',
              'js/tests/vk-greet-capability.test.js',
              ui='experiments/issue-56/vk-greet-native.mjs' if '--browser' in sys.argv else None)
