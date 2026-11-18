"""Verify missing proposals in the preceding rendered reader; restore bundle."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
bundle = root / 'js/src/web/app.min.js'
current = bundle.read_bytes()
log_path = root / 'ci-logs/forms-plan-browser-before.log'
try:
    bundle.write_bytes(subprocess.check_output(
        ['git', 'show', '946e4f87:js/src/web/app.min.js'], cwd=root))
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384',
               RUN_BROWSER_E2E='1', FORMS_PLAN_BEFORE='1')
    with log_path.open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'assertion failed: shared form answer planning exists' in log_path.read_text()
    print('Confirmed missing answer planning in the preceding reader UI.')
finally:
    bundle.write_bytes(current)
