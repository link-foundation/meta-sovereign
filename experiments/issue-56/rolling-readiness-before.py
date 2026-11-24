"""Reproduce the early status-timeout failure using the actual parent probe."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
helper = root / 'js/tests/helpers/rolling-cli-readiness.mjs'
current = helper.read_bytes()
parent = subprocess.check_output([
    'git', 'show', '4e866255:js/tests/rolling-cli.test.js'], cwd=root).decode()
probe = parent[parent.index('const statusWhenReady ='):parent.index('\n\ntest(')]
imports = """import { setTimeout as sleep } from 'node:timers/promises';
import { requestServerControl } from '../../src/server/rolling-control.js';
"""
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    helper.write_text(imports + 'export ' + probe + '\n')
    with (root / 'ci-logs/ci-question-watch-readiness-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            '--test-name-pattern=startup readiness retries',
            'js/tests/rolling-cli-readiness.test.js'], cwd=root, env=env,
            stdout=log, stderr=subprocess.STDOUT)
    if result.returncode != 1:
        raise RuntimeError(f'expected failing regression, got {result.returncode}')
finally:
    helper.write_bytes(current)
