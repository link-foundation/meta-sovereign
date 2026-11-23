"""Replay the detected instruction regressions on published 580a2012."""

from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = '580a2012200794b16a1ca6e541b5917110853bdc'
names = [
    'js/src/assignments/draft.js',
    'js/src/forms/assignment-recognition.js',
    'js/src/forms/assignment-store.js',
    'js/src/forms/plan-validation.js',
    'js/src/forms/read-document.js',
    'js/src/web/app.min.js',
]
browser = '--browser' in sys.argv
command = ['node', '--max-old-space-size=384']
if browser:
    command += ['js/tests/e2e-forms-reader-browser.mjs']
else:
    command += [
        '--test', '--test-concurrency=1',
        '--test-name-pattern=instruction links persist|invalid detected instruction|discovered instruction link',
        'js/tests/forms-assignment.test.js', 'js/tests/assignment-source.test.js',
    ]
env = dict(os.environ, RUN_BROWSER_E2E='1', FORMS_ASSIGNMENT_LINKED_ONLY='1',
           FORMS_ASSIGNMENT_LINKED_SCREENSHOTS='before')
original = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    result = subprocess.run(command, cwd=root, env=env, check=False)
finally:
    for name, data in original.items():
        (root / name).write_bytes(data)
sys.exit(result.returncode)
