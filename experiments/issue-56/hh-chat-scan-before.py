"""Reproduce missing traversal and the zero-count badge against the actual parent."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['browser-actions.js', 'browser-sender.js', 'browser-choice-document.js', 'hh-web-ui.js']
sources = [root / 'js/src/sources' / name for name in names]
current = {source: source.read_bytes() for source in sources}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for source in sources:
        source.write_bytes(subprocess.check_output([
            'git', 'show', f'1fb190ca:{source.relative_to(root)}'], cwd=root))
    with (root / 'ci-logs/hh-chat-scan-before-node.log').open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            'js/tests/hh-chat-list.test.js', 'js/tests/hh-chat-scan-sender.test.js'],
            cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode != 1:
        raise RuntimeError(f'expected failing regressions, got {result.returncode}')
    with (root / 'ci-logs/hh-chat-scan-before-ui.log').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/hh-chat-scan-ui.mjs', '--before'],
            cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
finally:
    for source, content in current.items():
        source.write_bytes(content)
