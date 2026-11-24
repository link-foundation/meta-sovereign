"""Run finite admission regressions against each exact published dispatch."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '0e595743098e0bfbe2cecdd4bda2b550c3a026c9'
cases = [
    ('js/src/cli/runner-command.js', [], 'CLI'),
    ('js/src/server/routes-runner.js', ['--api'], 'API'),
]
for name, args, kind in cases:
    source = root / name
    current = source.read_bytes()
    log = root / f'ci-logs/runner-health-before-{kind.lower()}.log'
    try:
        source.write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
        with log.open('w') as output:
            result = subprocess.run(['node', 'experiments/issue-56/runner-health-admission.mjs', *args],
                cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'), stdout=output, stderr=subprocess.STDOUT)
        assert result.returncode == 1
        assert f'not admitted by the real {kind}' in log.read_text()
        print(f'{parent} {kind} rejects application health; focused regression fails')
    finally:
        source.write_bytes(current)
