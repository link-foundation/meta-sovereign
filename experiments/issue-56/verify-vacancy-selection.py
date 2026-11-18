"""Check this selection/cache unit with one worker and no full source build."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
changed = subprocess.check_output([
    'git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
formatted = sorted({name for name in changed
                    if name.endswith(('.js', '.mjs', '.md'))
                    and not name.endswith('app.min.js')})
scripts = [name for name in formatted if name.endswith(('.js', '.mjs'))]
secrets = sorted({name for name in changed if name.endswith(
    ('.js', '.mjs', '.py', '.md')) and not name.endswith('app.min.js')})
tests = [
    'job-vacancy-selection', 'job-vacancy-cache-durability',
    'job-choice-durability', 'assignment-vacancy', 'vacancy-search',
    'vacancy-reader-regression',
]
commands = [
    ('format', ['node_modules/.bin/prettier', '--write', *formatted]),
    ('focused-final', ['node', '--test', '--test-concurrency=1',
                       *[f'js/tests/{name}.test.js' for name in tests]]),
    ('registry', ['node', '--test', '--test-concurrency=1',
                  'js/tests/ci-browser-shards.test.js']),
    ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js',
              '--max-warnings=0', *scripts]),
    ('prettier', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('secrets', ['node_modules/.bin/secretlint', *secrets]),
    ('diff', ['git', 'diff', '--check']),
]
for name, command in commands:
    with (root / f'ci-logs/vacancy-selection-{name}.log').open('w') as output:
        result = subprocess.run(command, cwd=root,
                                env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
                                stdout=output, stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
