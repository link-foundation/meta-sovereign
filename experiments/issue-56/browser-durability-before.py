"""Bounded replay of premature acknowledgment and overlapping browser saves."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/storage/browser-store.js'
current = source.read_bytes()
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', '789f317d:js/src/storage/browser-store.js'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-timeout=5000',
        '--test-name-pattern=acknowledge|serialize writes',
        'js/tests/browser-store-durability.test.js'], cwd=root,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
        capture_output=True)
    output = result.stdout.decode() + result.stderr.decode()
    print(output, end='')
    assert result.returncode != 0 and 'fail 2' in output
    print('Expected two actual-parent browser durability failures')
finally:
    source.write_bytes(current)
