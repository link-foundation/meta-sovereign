"""Run two durable catch-up regressions with the exact published peer module."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/sync/peer.js'
saved = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'4bfeaf2c:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1',
        'js/tests/sync-reconciliation-production.test.js'
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/reconciliation-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0 and 'fail 2' in log.read_text(), log.read_text()
    print('Both durable catch-up regressions fail on published 4bfeaf2c')
finally:
    (root / name).write_bytes(saved)
