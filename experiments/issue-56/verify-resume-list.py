"""Finite checks for the resume inventory unit; full matrices stay in hosted CI."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
changed = subprocess.check_output(['git', 'ls-files', '--modified', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
scripts = [name for name in changed if name.endswith(('.js', '.mjs'))
           and name != 'js/src/web/app.min.js']
formatted = scripts + [name for name in changed if name.endswith('.md')]
tests = ['js/tests/job-resumes.test.js', 'js/tests/vacancy-search.test.js', 'js/tests/vacancy-controls.test.js']
commands = [
    ('node', ['node', '--test', '--test-concurrency=1', '--test-timeout=15000', *tests]),
    ('deno', ['deno', 'test', '--allow-all', *tests]),
    ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js', '--max-warnings=0', *scripts]),
    ('format-check', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('secretlint', ['node_modules/.bin/secretlint', *formatted]),
    ('duplication', ['node_modules/.bin/jscpd', '.']),
]
for name, command in (commands[2:] if '--gates-only' in sys.argv else commands):
    with (root / f'ci-logs/resume-list-{name}.log').open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
