"""Reproduce missing runner admission in the exact published dispatch source."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'js/src/cli/index.js'
current = source.read_bytes()
log = root / 'ci-logs/runner-cli-before.log'
try:
    source.write_bytes(subprocess.check_output([
        'git', 'show', 'd6d3070d:js/src/cli/index.js'], cwd=root))
    with log.open('w') as output:
        result = subprocess.run(['node', 'experiments/issue-56/runner-cli-admission.mjs'],
            cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=128'),
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'runner status was not admitted by the real CLI' in log.read_text()
    print('Published dispatch refuses runner status; no process was launched')
finally:
    source.write_bytes(current)
