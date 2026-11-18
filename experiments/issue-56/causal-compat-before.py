"""Reproduce destination regressions with the published target reader."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/broadcast/targets.js'
saved = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'2fbdc4b2:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1',
        'js/tests/broadcast-causal-targets.test.js'
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/causal-compat-targets-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0 and 'fail 3' in log.read_text(), log.read_text()
    print('Three destination regressions fail on published 2fbdc4b2')
finally:
    (root / name).write_bytes(saved)
