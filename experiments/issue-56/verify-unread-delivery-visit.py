"""Run bounded focused checks sequentially, retaining each command's output."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
paths = subprocess.check_output([
    'git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
formatted = sorted({p for p in paths if p.endswith(('.js', '.mjs', '.json', '.md'))})
scripts = [p for p in formatted if p.endswith(('.js', '.mjs'))]
focused = [
    'js/tests/browser-conversation-tail.test.js',
    'js/tests/browser-unread-conversations.test.js',
    'js/tests/browser-conversation-history.test.js',
]
commands = [
    ('format', ['node_modules/.bin/prettier', '--write', *formatted]),
    ('node', ['node', '--test', '--test-concurrency=1', *focused]),
    ('deno', ['deno', 'test', '--allow-all', *focused]),
    ('registry', ['node', '--test', '--test-concurrency=1',
                  '--test-name-pattern=question provider and control scenarios',
                  'js/tests/ci-contracts.test.js']),
    ('registry-deno', ['deno', 'test', '--allow-all',
                       '--filter=question provider and control scenarios',
                       'js/tests/ci-contracts.test.js']),
    ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js',
              '--max-warnings=0', *scripts]),
    ('format-check', ['node_modules/.bin/prettier', '--check', *formatted]),
    ('secretlint', ['node_modules/.bin/secretlint', *formatted]),
    ('duplication', ['npm', 'run', 'check:duplication']),
]
for name, command in commands:
    log = root / f'ci-logs/unread-delivery-visit-{name}-verified.log'
    print(f'Running {name}', flush=True)
    with log.open('w') as output:
        result = subprocess.run(command, cwd=root, env=env,
                                stdout=output, stderr=subprocess.STDOUT)
    print(f'{name}: {result.returncode}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
