"""Check absent owner controls against the actual parent and restore sources."""
import os
from pathlib import Path
import subprocess
from parent_source_probe import verify_parent

root = Path(__file__).resolve().parents[2]
os.environ['E2E_BROWSER'] = 'webkit'
try:
    verify_parent(root, '64a9b6e2', 'vacancy-choices',
                  'js/tests/job-vacancy-choices.test.js',
                  'owner vacancy choices survive',
                  ui='experiments/issue-56/vacancy-choices-browser.mjs')
except subprocess.CalledProcessError as error:
    assert error.cmd == ['node', 'experiments/issue-56/vacancy-choices-browser.mjs', '--before']
    assert error.returncode == 1
    log = (root / 'ci-logs/vacancy-choices-before-ui.log').read_text()
    assert 'Saved owner vacancy choices must be available' in log
    print('Actual-parent owner controls are absent; all current sources restored.')
else:
    raise AssertionError('The actual parent unexpectedly provides owner controls')
