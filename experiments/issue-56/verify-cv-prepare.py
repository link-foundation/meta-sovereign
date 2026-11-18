"""Focused native About checks; full runtime/browser matrices remain in GitHub CI."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
changed = subprocess.check_output(['git', 'ls-files', '--modified', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
scripts = [name for name in changed if name.endswith(('.js', '.mjs')) and name != 'js/src/web/app.min.js']
formatted = scripts + [name for name in changed if name.endswith(('.md', '.json'))]
tests = ['js/tests/cv-prepare.test.js', 'js/tests/cv-prepare-controls.test.js']
commands = [
    ('node-final', ['node', '--test', '--test-concurrency=1', '--test-timeout=15000', *tests]),
    ('deno-final', ['deno', 'test', '--allow-all', '--v8-flags=--max-old-space-size=384', *tests]),
    ('compatibility-final', ['node', '--test', '--test-concurrency=1', '--test-timeout=15000', 'js/tests/vacancy-search.test.js', 'js/tests/vacancy-controls.test.js', 'js/tests/cv-technology-review.test.js', 'js/tests/cv-technology-controls.test.js']),
    ('ci-contracts', ['node', '--test', '--test-concurrency=1', '--test-name-pattern=vacancy reads and local analysis', 'js/tests/ci-contracts.test.js']),
    ('lint-final', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js', '--max-warnings=0', *scripts]),
    ('static-final', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('secrets-final', ['node_modules/.bin/secretlint', *formatted]),
    ('duplication', ['node_modules/.bin/jscpd', '.']),
]
for name, command in commands:
    if '--gates-only' in sys.argv and name not in ['lint-final', 'static-final', 'secrets-final', 'duplication']:
        continue
    with (root / f'ci-logs/cv-prepare-{name}.log').open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
