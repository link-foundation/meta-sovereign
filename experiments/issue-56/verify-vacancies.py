"""Check the finite vacancy unit sequentially, without a source build or full suite."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
changed = subprocess.check_output(['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
formatted = sorted({name for name in changed if name.endswith(('.js', '.mjs', '.md', '.json')) and not name.endswith('app.min.js')})
scripts = [name for name in formatted if name.endswith(('.js', '.mjs'))]
tests = ['js/tests/vacancy-search.test.js', 'js/tests/vacancy-controls.test.js', 'js/tests/vacancy-reader-regression.test.js', 'js/tests/assignment-vacancy.test.js']
commands = [
    ('format', ['node_modules/.bin/prettier', '--write', *formatted]),
    ('node', ['node', '--test', '--test-concurrency=1', '--test-timeout=15000', *tests]),
    ('deno', ['deno', 'test', '--allow-all', *tests]),
    ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js', '--max-warnings=0', *scripts]),
    ('format-check', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('secretlint', ['node_modules/.bin/secretlint', *formatted]),
    ('duplication', ['npm', 'run', 'check:duplication']),
]
for name, command in commands:
    with (root / f'ci-logs/vacancy-{name}-verified.log').open('w') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
