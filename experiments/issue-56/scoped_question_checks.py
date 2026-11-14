"""Verify this finite notice unit sequentially with bounded Node memory."""
import os
from pathlib import Path
import subprocess

def verify_question_unit(prefix, focused):
    root = Path(__file__).resolve().parents[2]
    env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
    paths = subprocess.check_output(['git', 'ls-files', '--modified', '--others',
                                   '--exclude-standard', '-z'], cwd=root).decode().split('\0')
    formatted = sorted({name for name in paths if name.endswith(('.js', '.mjs', '.md', '.json'))
                        and not name.endswith('app.min.js')})
    scripts = [name for name in formatted if name.endswith(('.js', '.mjs'))]
    commands = [
        ('format', ['node_modules/.bin/prettier', '--write', *formatted]),
        ('node', ['node', '--test', '--test-concurrency=1', *focused]),
        ('deno', ['deno', 'test', '--allow-all', *focused]),
        ('registry', ['node', '--test', '--test-concurrency=1',
                      '--test-name-pattern=question provider and control scenarios',
                      'js/tests/ci-contracts.test.js']),
        ('registry-deno', ['deno', 'test', '--allow-all',
                           '--filter=question provider and control scenarios', 'js/tests/ci-contracts.test.js']),
        ('lint', ['node_modules/.bin/eslint', '--config', 'js/eslint.config.js', '--max-warnings=0', *scripts]),
        ('format-check', ['node_modules/.bin/prettier', '--check', *formatted]),
        ('secretlint', ['node_modules/.bin/secretlint', *formatted]),
        ('duplication', ['npm', 'run', 'check:duplication']),
    ]
    for name, command in commands:
        print(f'Running {name}', flush=True)
        with (root / f'ci-logs/{prefix}-{name}-verified.log').open('w') as output:
            result = subprocess.run(command, cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT)
        print(f'{name}: {result.returncode}', flush=True)
        if result.returncode:
            raise SystemExit(result.returncode)
