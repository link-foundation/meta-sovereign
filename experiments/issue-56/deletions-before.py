"""Replay two deletion regressions on the exact causal-admission parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'a874e936'
names = subprocess.check_output(
    ['git', 'diff', '--name-only', parent, '--', 'js/src'], cwd=root
).decode().splitlines()
names = [name for name in names if name != 'js/src/web/app.min.js'
         and subprocess.run(['git', 'cat-file', '-e', f'{parent}:{name}'],
                            cwd=root, capture_output=True).returncode == 0]
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in saved:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    result = subprocess.run([
        'node', '--test', '--test-concurrency=1', 'js/tests/deletions-production.test.js'
    ], cwd=root, capture_output=True, text=True,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'))
    log = root / 'ci-logs/deletions-parent.log'
    log.write_text(result.stdout + result.stderr)
    assert result.returncode != 0 and 'fail 2' in log.read_text(), log.read_text()
    print('Both production deletion regressions fail on a874e936')
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
