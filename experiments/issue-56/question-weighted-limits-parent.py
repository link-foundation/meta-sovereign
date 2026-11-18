"""Replay the standalone weighted length regression on the exact published source."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2],
              'e574976e926a878d0b2754241417326f0f343a42',
              'question-weighted-limits', 'js/tests/question-weighted-limits.test.js')
