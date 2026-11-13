"""Replay the finite copy-slot regression on the exact published parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/server/rolling-release.js'
original = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'dec17a26:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-name-pattern',
        'one pending snapshot copy', 'js/tests/rolling-release-copy.test.js',
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/release-pool-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0, 'published parent unexpectedly passed'
    assert '4 !== 14' in log.read_text(), log.read_text()
    print('The fourteen-file copy-slot regression fails on dec17a26 (4 versus 14)')
finally:
    (root / name).write_bytes(original)
