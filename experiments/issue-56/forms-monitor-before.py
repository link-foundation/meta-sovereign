"""Verify lost owner edits and later pages on the preceding production commit."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/forms/review-sessions.js', 'js/src/web/app.min.js']
saved = {name: (root / name).read_bytes() for name in names}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', '2e1d1c9f:' + name], cwd=root))
    with (root / 'ci-logs/forms-monitor-node-before.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', '--test-timeout=15000',
                                 '--test-name-pattern=automatic checkpoints retain', 'js/tests/forms-monitor.test.js'],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    env.update({'RUN_BROWSER_E2E': '1', 'FORMS_MONITOR_BEFORE': '1', 'FORMS_MONITOR_ONLY': '1'})
    with (root / 'ci-logs/forms-monitor-browser-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'rapid Next retains the previous page owner answer' in (root / 'ci-logs/forms-monitor-browser-before.log').read_text()
    env.pop('FORMS_MONITOR_BEFORE')
    env.pop('FORMS_MONITOR_ONLY')
    env['FORMS_PLAN_ONLY'] = '1'
    with (root / 'ci-logs/forms-monitor-download-before.log').open('w') as log:
        result = subprocess.run(['node', 'js/tests/e2e-forms-reader-browser.mjs'], cwd=root,
                                env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'download exports the actual proposal and evidence' in (root / 'ci-logs/forms-monitor-download-before.log').read_text()
    print('Confirmed lost owner edit and absent automatic later pages on 2e1d1c9f')
finally:
    for name, contents in saved.items():
        (root / name).write_bytes(contents)
