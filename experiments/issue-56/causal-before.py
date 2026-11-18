"""Replay two ordinary-write regressions on the exact published source parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = subprocess.check_output(
    ['git', 'diff', '--name-only', '96a54d99', '--', 'js/src'], cwd=root
).decode().splitlines()
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in saved:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'96a54d99:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', 'js/tests/causal-production.test.js'
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/causal-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0 and 'fail 2' in log.read_text(), log.read_text()
    print('Both ordinary-write production regressions fail on 96a54d99')
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
