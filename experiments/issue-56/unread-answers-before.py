"""Finite actual-parent feature regression and native before capture."""
from pathlib import Path
from parent_source_probe import verify_parent

verify_parent(Path(__file__).resolve().parents[2], '83fea0ee', 'unread-answers',
              'js/tests/question-unread-answers.test.js',
              pattern='approved bot choices continue sequentially',
              ui='experiments/issue-56/unread-answers-browser.mjs')
print('Restored production sources after parent assertions and native before capture')
