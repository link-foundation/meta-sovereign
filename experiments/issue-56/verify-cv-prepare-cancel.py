"""Focused About cancellation checks; hosted CI owns full runtime/browser matrices."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
changed = subprocess.check_output(['git', 'ls-files', '--modified', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
scripts = [name for name in changed if name.endswith(('.js', '.mjs')) and name != 'js/src/web/app.min.js']
formatted = scripts + [name for name in changed if name.endswith(('.md', '.json'))]
tests = [f'js/tests/{name}.test.js' for name in ['cv-prepare-cancel', 'cv-prepare-cancel-controls', 'cv-prepare', 'cv-prepare-controls']]
commands = [
    ('node-final', ['node', '--test', '--test-concurrency=1', '--test-timeout=15000', *tests]),
    ('deno-final', ['deno', 'test', '--allow-all', '--v8-flags=--max-old-space-size=384', *tests]),
    ('ci-contracts', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=vacancy reads and local analysis', 'js/tests/ci-contracts.test.js']),
    ('lint-final', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js', '--max-warnings=0', *scripts]),
    ('static-final', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('secrets-final', ['node_modules/.bin/secretlint', *formatted]),
]
for name, command in commands:
    if '--gates-only' in sys.argv and name in ['node-final', 'deno-final']:
        continue
    with (root / f'ci-logs/cv-prepare-cancel-{name}.log').open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
