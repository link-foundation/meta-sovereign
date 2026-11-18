"""Replay the finite repeated-answer regressions against the published source."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '9636107f',
              'question-repeated-answer', 'js/tests/question-repeated-answer.test.js')
