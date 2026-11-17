"""Capture the published parent's UI with the same finite browser assertion."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
bundle = root / 'js/src/web/app.min.js'
original = bundle.read_bytes()
env = dict(os.environ, RUN_BROWSER_E2E='1', E2E_BROWSER='chromium',
           E2E_EXECUTABLE_PATH='/opt/google/chrome/chrome',
           APPLICATION_SCREENSHOTS='docs/screenshots', SALARY_LADDER_BEFORE='1')
try:
    bundle.write_bytes(subprocess.check_output(
        ['git', 'show', '51047939:js/src/web/app.min.js'], cwd=root))
    with (root / 'ci-logs/salary-ladder-ui-before.log').open('w') as log:
        result = subprocess.run(['node', '--max-old-space-size=384',
            'experiments/issue-56/salary-ladder-browser.mjs'], cwd=root, env=env,
            stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0
    assert 'Matching-search salary tiers must be configurable' in (
        root / 'ci-logs/salary-ladder-ui-before.log').read_text()
finally:
    bundle.write_bytes(original)
