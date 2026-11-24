"""Finite baseline probes and an optional isolated before screenshot fixture."""
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
probes = [
    ('finder', 'js/src/sources/auto-import/telegram-creds.js',
     'finder rechecks|finder masks'),
    ('cli', 'js/src/cli/telegram-login-commands.js', 'CLI Follow env migration'),
    ('routes', 'js/src/server/routes-auto-import.js', 'default finder route|finder phone migration'),
]
for name, file, pattern in probes:
    if '--serve-before' in sys.argv and name != 'finder':
        continue
    path = root / file
    original = path.read_bytes()
    try:
        path.write_bytes(subprocess.check_output(
            ['git', 'show', f'5cc23d06:{file}'], cwd=root))
        if '--serve-before' in sys.argv:
            subprocess.run(['node', 'experiments/issue-56/legacy-follow-ui.mjs'], cwd=root, check=True)
        else:
            with (root / f'ci-logs/legacy-follow-before-{name}.log').open('w') as log:
                result = subprocess.run(
                    ['node', '--test', '--test-concurrency=1', '--test-timeout=15000',
                     f'--test-name-pattern={pattern}', 'js/tests/telegram-follow-session.test.js'],
                    cwd=root, stdout=log, stderr=subprocess.STDOUT)
            assert result.returncode != 0, f'{name}: expected regression failure'
    finally:
        path.write_bytes(original)
print('Baseline probes finished; corrected sources restored.')
