"""Reproduce absent collection on the published parent, restoring every source."""
from pathlib import Path
import sys
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '2733ff54', 'vk-attachments',
              'js/tests/vk-attachment-metadata.test.js', pattern='VK archive collects only',
              ui='experiments/issue-56/vk-attachments-native.mjs'
              if '--browser' in sys.argv else None)
print('Actual-parent ingestion fails the missing collection assertion; all sources restored.')
