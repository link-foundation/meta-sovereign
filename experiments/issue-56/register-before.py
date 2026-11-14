"""Replay five finite convergence failures on the exact published peer module."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
name = 'js/src/sync/peer.js'
original = (root / name).read_bytes()
try:
    (root / name).write_bytes(subprocess.check_output(
        ['git', 'show', f'fc7c095c:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', '--test-name-pattern',
        '^(equal vector|joined clocks|merge ignores|decimal tick|absent vector)',
        'js/tests/sync-register.test.js',
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/register-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0, 'published parent unexpectedly passed'
    assert 'fail 5' in log.read_text(), log.read_text()
    print('All five finite convergence regressions fail on fc7c095c')
finally:
    (root / name).write_bytes(original)
