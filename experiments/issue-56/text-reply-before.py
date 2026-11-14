"""Reproduce missing frozen text delivery on the actual parent and restore it."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '1a35532cb2c87593cb887ebaec0e4e45f221d72b'
names = [f'js/src/sources/{name}.js' for name in (
    'browser-sender', 'browser-choices', 'browser-choice-controller',
    'browser-answer-watch', 'hh-web-ui')]
saved = {name: (root / name).read_bytes() for name in names}
env = {**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/text-reply-before-node.log').open('wb') as output:
        result = subprocess.run(['node', '--test', '--test-concurrency=1', '--test-timeout=10000',
                                 'js/tests/browser-text-admission.test.js'], cwd=root, env=env,
                                stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1
    data = (root / 'ci-logs/text-reply-before-node.log').read_text()
    assert 'fail 1' in data and "'undefined'" in data, data
    with (root / 'ci-logs/text-reply-before-browser.log').open('wb') as output:
        subprocess.run(['node', 'experiments/issue-56/text-reply-browser.mjs', '--before'], cwd=root,
                       env=env, stdout=output, stderr=subprocess.STDOUT, check=True)
finally:
    for name, value in saved.items():
        (root / name).write_bytes(value)
