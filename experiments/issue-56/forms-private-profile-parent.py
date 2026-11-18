"""Reproduce missing automatic private contacts against the published parent."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2],
              '77bd5f7129c8c1a628832f0ce63875d5b83875a9',
              'forms-private-profile', 'js/tests/forms-private-profile.test.js')
