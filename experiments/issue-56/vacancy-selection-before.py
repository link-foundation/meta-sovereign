"""Verify the actual parent lacks selection review and restore current sources."""
import os
from pathlib import Path
import subprocess
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
os.environ['E2E_BROWSER'] = 'webkit'
try:
    verify_parent(root, '222f2e80', 'vacancy-selection',
                  'js/tests/job-vacancy-selection.test.js',
                  'selection honors private choices',
                  ui='experiments/issue-56/vacancy-selection-browser.mjs')
except subprocess.CalledProcessError as error:
    assert error.returncode == 1
    assert error.cmd[-1] == '--before'
    assert 'Search selection reasons must be available' in (
        root / 'ci-logs/vacancy-selection-before-ui.log').read_text()
    print('Actual parent lacks selection review; all current sources restored.')
else:
    raise AssertionError('The actual parent unexpectedly supplies selection review')
