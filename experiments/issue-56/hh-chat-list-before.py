"""Run finite native-cell regressions against the actual preceding adapter."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
sources = [root / 'js/src/sources' / name for name in ['hh-web-ui.js', 'browser-actions.js']]
current = {source: source.read_bytes() for source in sources}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for source in sources:
        source.write_bytes(subprocess.check_output([
            'git', 'show', f'4ab67839:{source.relative_to(root)}'], cwd=root))
    with (root / 'ci-logs/hh-chat-list-before-node.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', 'js/tests/hh-chat-list.test.js'],
            cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode != 1:
        raise RuntimeError(f'expected failing regressions, got {result.returncode}')
    with (root / 'ci-logs/hh-chat-list-before-ui.log').open('w') as log:
        subprocess.run(['node', 'experiments/issue-56/hh-chat-list-ui.mjs', '--before'],
                       cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
finally:
    for source, content in current.items():
        source.write_bytes(content)
