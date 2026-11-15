"""Reproduce the missing API against the exact published server dispatch."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/server/index.js'
current = source.read_bytes()
log = root / 'ci-logs/runner-api-before.log'
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', 'adb2c8f1:js/src/server/index.js'], cwd=root))
    with log.open('w') as output:
        result = subprocess.run(['node', 'experiments/issue-56/runner-api-admission.mjs'],
            cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'runner status was not admitted by the real API' in log.read_text()
    assert '404 !== 200' in log.read_text()
    print('Published dispatch refuses runner status with HTTP 404; no process launched')
finally:
    source.write_bytes(current)
