"""Reproduce missing chat intent on the exact parent; restore drafted bytes."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/jobs/application-batch-data.js'
draft = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'933b23fb:{name}'], cwd=root))
    with (root / 'ci-logs/application-chats-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=chat intent defaults',
            'js/tests/job-application-chats.test.js'], cwd=root, stdout=log,
            stderr=subprocess.STDOUT,
            env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode == 1, result.returncode
    text = (root / 'ci-logs/application-chats-before.log').read_text()
    assert 'application-owned chat intent is missing' in text
finally:
    (root / name).write_bytes(draft)
print('Exact-parent intent regression failed; drafted source restored.')
