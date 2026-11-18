"""Reproduce the empty-form completion bug and the unreadable CAPTCHA UI on HEAD.

The preceding committed implementation is loaded in child processes; every
working source file is restored even if a reproduction fails.
"""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
paths = subprocess.check_output(['git', 'diff', '--name-only', '--', 'js/src'], cwd=root, text=True).splitlines()
saved = {name: (root / name).read_bytes() for name in paths}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'HEAD:{name}'], cwd=root))
    with (root / 'ci-logs/forms-captcha-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-name-pattern=an empty inspection', 'js/tests/forms-captcha.test.js'], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'The empty inspection unexpectedly refused completion before the fix.'
    with (root / 'ci-logs/forms-captcha-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
            env={**env, 'E2E_EXECUTABLE_PATH': '/opt/google/chrome/chrome', 'RUN_BROWSER_E2E': '1', 'FORMS_CAPTCHA_ONLY': '1', 'FORMS_CAPTCHA_BEFORE': '1'}, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'The preceding reader unexpectedly excluded the private challenge.'
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
