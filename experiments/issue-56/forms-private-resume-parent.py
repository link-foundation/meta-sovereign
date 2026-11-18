"""Reproduce the conventional PDF gap against the actual published planner."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2],
              '5283e26af0135f86fc879a30be18ae418da17c4a',
              'forms-private-resume', 'js/tests/forms-private-resume.test.js')
