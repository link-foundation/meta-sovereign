"""Replay bounded log-order regressions against the exact published sources."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/storage/lino-store.js', 'js/src/storage/mutation.js',
         'js/src/storage/universal.js']
original = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'e8ff3c84:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1',
        'js/tests/lino-mutation-order.test.js'], cwd=root,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
        capture_output=True, text=True)
    log = root / 'ci-logs/lino-admission-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0, 'published parent unexpectedly passed'
    assert 'fail 15' in log.read_text(), log.read_text()
    print('All 15 finite log-order/input regressions fail on published e8ff3c84')
finally:
    for name, contents in original.items():
        (root / name).write_bytes(contents)
