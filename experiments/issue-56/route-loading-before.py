"""Replay the idle-import boundary against the exact published implementation."""
from parent_replay import replay_parent
from pathlib import Path
import subprocess

parent = 'f09c8d2b0199e6693a9bfe22471e9b3ad81c5009'
replay_parent(__file__, 'route-loading', parent, [
    ('startup', 'js/src/server/index.js', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=idle startup', 'js/tests/route-loading.test.js']),
])

root = Path(__file__).resolve().parents[2]
entry = root / 'js/src/server/index.js'
original = entry.read_bytes()
try:
    entry.write_bytes(subprocess.check_output([
        'git', 'show', f'{parent}:js/src/server/index.js'], cwd=root))
    with (root / 'ci-logs/route-loading-graph-before.json').open('w') as log:
        subprocess.run(['node', '--max-old-space-size=192',
                        'experiments/issue-56/worker-import-graph.mjs'],
                       cwd=root, stdout=log, check=True)
finally:
    entry.write_bytes(original)
