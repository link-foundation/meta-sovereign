"""Finite admission regression against the actual parent; restore every source."""
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PARENT = 'e0b0bbdcd11b06679337a5c5b40e72f02da9af5d'
FILES = [f'js/src/sources/{name}.js' for name in (
    'browser-chat-scan', 'browser-sender', 'hh-web-ui')]
saved = {name: (ROOT / name).read_bytes() for name in FILES}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in FILES:
        (ROOT / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{PARENT}:{name}'], cwd=ROOT))
    with (ROOT / 'ci-logs/conversation-history-before-node.log').open('wb') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=10000',
            '--test-name-pattern=public conversation scanner',
            'js/tests/browser-conversation-history.test.js',
        ], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
    data = (ROOT / 'ci-logs/conversation-history-before-node.log').read_text()
    assert 'fail 1' in data and "'undefined'" in data, data
    with (ROOT / 'ci-logs/conversation-history-before-browser.log').open('wb') as log:
        subprocess.run(['node', 'experiments/issue-56/conversation-history-browser.mjs', '--before'],
                       cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
finally:
    for name, value in saved.items():
        (ROOT / name).write_bytes(value)
