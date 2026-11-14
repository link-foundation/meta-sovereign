"""Reproduce assignment bypasses on the pinned parent; restore every source."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '50ddab328ff15b8185ce993681d1bf5905c4aaa4'
paths = subprocess.check_output(['git', 'diff', '--name-only', '--', 'js/src'], cwd=root, text=True).splitlines()
saved = {name: (root / name).read_bytes() for name in paths}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/forms-assignment-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', '--test-name-pattern=assignment prerequisite holds|automatic prefilling refuses all writes|reviewed PDF attachment also refuses', 'js/tests/forms-assignment.test.js'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'Assignment bypasses unexpectedly passed on the parent.'
    with (root / 'ci-logs/forms-assignment-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root, env={**env, 'E2E_EXECUTABLE_PATH': '/opt/google/chrome/chrome', 'RUN_BROWSER_E2E': '1', 'FORMS_ASSIGNMENT_ONLY': '1', 'FORMS_ASSIGNMENT_BEFORE': '1'}, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'The old browser unexpectedly held the assignment.'
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
