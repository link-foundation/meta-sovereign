"""Bounded stale-tab regressions against the exact published browser adapter."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/storage/browser-store.js'
saved = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'eefc6f7d:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=stale tab|shared driver|legacy snapshot',
        'js/tests/browser-store-conflicts.test.js'
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/browser-ownership-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0 and 'fail 7' in log.read_text(), log.read_text()
    print('Seven stale snapshot regressions fail on published eefc6f7d')
finally:
    (root / name).write_bytes(saved)
