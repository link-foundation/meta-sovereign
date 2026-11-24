"""Reproduce default-policy admission against the actual parent module."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'js/src/automation/question-policy.js'
current = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', 'cdbfeaf1:js/src/automation/question-policy.js'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-timeout=15000',
        '--test-name-pattern=each saved notice policy defaults',
        'js/tests/question-notice-policy.test.js'], cwd=root,
        env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'})
    assert result.returncode != 0
    print('Actual parent does not retain independent saved notice policies.')
finally:
    path.write_bytes(current)
