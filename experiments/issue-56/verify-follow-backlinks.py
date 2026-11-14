"""Run only focused workflow contracts and scoped diagnostic source gates."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
changed = subprocess.check_output(['git', 'ls-files', '--modified', '--others',
    '--exclude-standard'], cwd=root).decode().splitlines()
scripts = [name for name in changed if name.endswith(('.js', '.mjs'))]
formatted = scripts + [name for name in changed if name.endswith(('.md', '.json'))]
commands = [
    ('contracts', ['node', '--test', '--test-concurrency=1',
        '--test-name-pattern=browser failures|workflow policy|vacancy reads',
        'js/tests/ci-contracts.test.js']),
    ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js',
        '--max-warnings=0', *scripts]),
    ('static', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('secrets', ['node_modules/.bin/secretlint', *formatted]),
    ('duplication', ['node_modules/.bin/jscpd', '.']),
]
for name, command in commands:
    with (root / f'ci-logs/follow-backlinks-{name}.log').open('w') as output:
        result = subprocess.run(command, cwd=root, env=env, stdout=output,
                                stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
