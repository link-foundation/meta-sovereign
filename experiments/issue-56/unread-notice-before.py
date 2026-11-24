"""Finite actual-parent service/UI probes; always restore the working sources."""
import os
from pathlib import Path
import subprocess

paths = ['js/src/automation/question-browser.js', 'js/src/web/app.min.js']
saved = {name: Path(name).read_bytes() for name in paths}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in paths:
        Path(name).write_bytes(subprocess.check_output(['git', 'show', f'ebd6f80d:{name}']))
    with Path('ci-logs/unread-notice-before-node.log').open('w') as output:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-name-pattern=default policies leave borrowed notices',
            'js/tests/question-unread-notices.test.js'], env=env,
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    with Path('ci-logs/unread-notice-before-browser.log').open('w') as output:
        result = subprocess.run(['node', 'experiments/issue-56/unread-notice-browser.mjs', '--before'],
            env=env, stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 0
finally:
    for name, body in saved.items():
        Path(name).write_bytes(body)
print('Restored both working sources after actual-parent probes.')
