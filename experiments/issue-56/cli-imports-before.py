"""Reproduce eager serve imports on the actual parent, restoring edited sources."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '96cd02273937d79cf163461c4c4a6acc76620f15'
names = ['js/src/cli/index.js', 'js/src/cli/migrate-commands.js']
saved = {name: (root / name).read_bytes() for name in names}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/cli-startup-imports-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=30000',
            'js/tests/cli-startup-imports.test.js',
        ], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    assert 'serve imported unrelated command/provider code' in (
        root / 'ci-logs/cli-startup-imports-before.log').read_text()
    with (root / 'ci-logs/cli-startup-imports-before.json').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/cli-serve-imports.mjs'],
                       cwd=root, env=env, check=True, stdout=log)
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
print('Actual-parent import assertion fails; working sources restored.')
