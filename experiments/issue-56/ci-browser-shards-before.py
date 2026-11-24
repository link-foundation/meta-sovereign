"""Prove that the actual preceding browser runner ignores shard assignment."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/scripts/run-browser-checks.mjs'
path = root / name
saved = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output(['git', 'show', f'99928003:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=actual browser runner', 'js/tests/ci-browser-shards.test.js',
    ], cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, end='')
    assert result.returncode == 1 and 'ERR_ASSERTION' in result.stdout
    assert "'second'" in result.stdout and "'fourth'" in result.stdout
    print('Actual parent executes checks assigned to other shards; current runner restored.')
finally:
    path.write_bytes(saved)
