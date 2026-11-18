"""Replay three finite browser durability regressions on published sources."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/storage/browser-store.js'
original = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'ff43da4f:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-name-pattern',
        '^browser (puts wait|snapshots serialize|bulk admission)',
        'js/tests/browser-store-save.test.js',
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/browser-save-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0, 'published parent unexpectedly passed'
    assert 'fail 3' in log.read_text(), log.read_text()
    assert "'before'" in log.read_text() and "'after'" in log.read_text()
    print('All three finite durability regressions fail on ff43da4f')
finally:
    (root / name).write_bytes(original)
