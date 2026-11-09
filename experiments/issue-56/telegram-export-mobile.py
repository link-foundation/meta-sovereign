"""Run the six-message browser fixture with baseline/current CSS, sequentially.

This checks actual mobile label bounds; it does not run a browser matrix.
The stylesheet is restored even when the baseline browser assertion fails.
"""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
css = root / 'js/src/web/app.css'
baseline = 'f42c4c46ce23e3d9c80b0cd396ba5a4ec0148d8b'
env = {**os.environ, 'RUN_BROWSER_E2E': '1', 'E2E_BROWSER': 'chromium',
       'E2E_EXECUTABLE_PATH': '/usr/bin/google-chrome',
       'E2E_ARTIFACT_DIR': str(root / 'ci-logs/telegram-export-mobile-artifacts')}
command = ['node', 'js/tests/e2e-export-browser.mjs']
original = css.read_bytes()
try:
    css.write_bytes(subprocess.check_output(['git', 'show', f'{baseline}:js/src/web/app.css'], cwd=root))
    with (root / 'ci-logs/telegram-export-mobile-before.log').open('w') as output:
        before = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
finally:
    css.write_bytes(original)
with (root / 'ci-logs/telegram-export-mobile-after.log').open('w') as output:
    after = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
assert before.returncode != 0, 'Baseline mobile layout unexpectedly passed'
assert after.returncode == 0, 'Current mobile layout did not pass'
print(f'PASS: baseline {before.returncode}; current {after.returncode}; stylesheet restored')
