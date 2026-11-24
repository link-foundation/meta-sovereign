"""Finite real parent startup refusal and pre-control browser evidence."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '3659e48941ef520bcc06298a15c05bbbf3a1b80b'
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')

def probe(paths, command, log):
    saved = {path: (root / path).read_bytes() for path in paths}
    try:
        for path in paths:
            (root / path).write_bytes(subprocess.check_output([
                'git', 'show', f'{parent}:{path}'], cwd=root))
        with (root / log).open('w') as output:
            return subprocess.run(command, cwd=root, env=env,
                                  stdout=output, stderr=subprocess.STDOUT)
    finally:
        for path, content in saved.items():
            (root / path).write_bytes(content)

log = 'ci-logs/runner-log-before-node.log'
result = probe(['js/src/server/index.js'], [
    'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
    '--test-name-pattern=actual runtime startup refusal',
    'js/tests/runner-log.test.js'], log)
text = (root / log).read_text()
assert result.returncode == 1 and 'ENOENT' in text and 'fail 1' in text
assert 'SyntaxError' not in text and 'ERR_MODULE_NOT_FOUND' not in text
result = probe(['js/src/web/app.min.js'], [
    'node', 'experiments/issue-56/runner-log-native.mjs', '--before'],
    'ci-logs/runner-log-before-ui.log')
assert result.returncode == 0
