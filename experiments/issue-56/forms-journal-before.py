"""Reproduce missing retained review history and UI against the preceding commit."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/forms/reader.js', 'js/src/forms/review-sessions.js', 'js/src/web/app.min.js']
saved = {name: (root / name).read_bytes() for name in names}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', '1d0526a9:' + name], cwd=root))
    with (root / 'ci-logs/forms-journal-node-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', '--test-timeout=15000',
                                 '--test-name-pattern=review history retains', 'js/tests/forms-journal.test.js'],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'historyReview is not a function' in (root / 'ci-logs/forms-journal-node-before.log').read_text()
    env.update({'RUN_BROWSER_E2E': '1', 'FORMS_JOURNAL_BEFORE': '1', 'FORMS_JOURNAL_ONLY': '1'})
    with (root / 'ci-logs/forms-journal-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'captured pages are available' in (root / 'ci-logs/forms-journal-browser-before.log').read_text()
    print('Confirmed absent review history and UI on 1d0526a9')
finally:
    for name, contents in saved.items():
        (root / name).write_bytes(contents)
