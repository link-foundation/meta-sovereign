"""Finite comparison against the published parent; always restore current bytes."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = '53a84792'
names = subprocess.check_output(['git', 'diff', '--name-only', parent, '--', 'js/src'], cwd=root).decode().splitlines()
names = list(dict.fromkeys([*names, 'js/src/web/app.min.js']))
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    if '--browser' in sys.argv:
        subprocess.run(['node', '--max-old-space-size=384', 'js/scripts/build-web.mjs'], cwd=root, check=True)
        command = ['node', '--max-old-space-size=384', 'experiments/issue-56/vk-identity-browser.mjs', '--before']
        expected = 0
    else:
        command = ['node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
                   '--test-name-pattern=preset is disabled|preference beats', 'js/tests/vk-identity.test.js']
        expected = 1
    result = subprocess.run(command, cwd=root, check=False)
    assert result.returncode == expected, f'Expected {expected}, got {result.returncode}'
finally:
    for name, value in saved.items():
        (root / name).write_bytes(value)
    print('Restored all actual-parent identity comparison sources.')
