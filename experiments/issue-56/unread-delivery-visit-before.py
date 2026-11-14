"""Reproduce the actual parent's absent borrowed-visit contract, restoring on exit."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'js/src/sources/browser-unread-conversations.js'
working = path.read_bytes()
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
parent = '3d72c6df1420d690cfdad75339426e248fd6b96a'
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', f'{parent}:{path.relative_to(root)}'], cwd=root))
    with (root / 'ci-logs/unread-delivery-visit-before-node.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            'js/tests/browser-unread-conversations.test.js'],
            cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'The parent unexpectedly passed the regression'
    with (root / 'ci-logs/unread-delivery-visit-before-browser.log').open('w') as log:
        subprocess.run([
            'node', 'experiments/issue-56/unread-delivery-visit-browser.mjs', '--before'],
            cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
finally:
    path.write_bytes(working)
    print('Restored the working unread source')
