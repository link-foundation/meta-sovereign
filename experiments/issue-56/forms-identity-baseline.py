"""Reproduce a changed browser clock without repeating the whole browser suite."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
paths = [f'js/src/forms/{name}.js' for name in (
    'read-document', 'inspection', 'review-targets', 'review-monitor', 'review-learning')]
original = {name: (root / name).read_bytes() for name in paths}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1',
           E2E_BROWSER='webkit', FORMS_PREFILL_ONLY='1',
           FORMS_IDENTITY_SCREENSHOTS='1', CI_BROWSER_DEBUG='1')
try:
    for name in paths:
        data = subprocess.check_output(['git', 'show', f'dc74e618:{name}'], cwd=root)
        (root / name).write_bytes(data)
    with (root / 'ci-logs/forms-identity-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    text = (root / 'ci-logs/forms-identity-browser-before.log').read_text()
    assert result.returncode != 0 and 'lost response never triggers an implicit repeated application' in text
finally:
    for name, data in original.items():
        (root / name).write_bytes(data)
