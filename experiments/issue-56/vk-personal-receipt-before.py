"""Retain the published shared-executor receipt-label compatibility regression."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '29b14f72',
              'vk-proactive-quality', 'js/tests/vk-cancelled.test.js')
