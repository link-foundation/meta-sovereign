"""Finite parent regression and actual pre-summary browser evidence."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '7205a3c0c7e853a9028274721d6fb285a8ceaefb'
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')

def run_parent(paths, command, destination):
    saved = {path: (root / path).read_bytes() for path in paths}
    try:
        for path in paths:
            (root / path).write_bytes(subprocess.check_output([
                'git', 'show', f'{parent}:{path}'], cwd=root))
        with (root / destination).open('w') as output:
            return subprocess.run(command, cwd=root, env=env,
                                  stdout=output, stderr=subprocess.STDOUT)
    finally:
        for path, content in saved.items():
            (root / path).write_bytes(content)

log = 'ci-logs/friend-stats-before-node.log'
result = run_parent(['js/src/automation/vk-friend-delivery.js'], [
    'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
    '--test-name-pattern=acceptance statistics survive',
    'js/tests/vk-friend-stats.test.js'], log)
text = (root / log).read_text()
assert result.returncode == 1 and '1 !== 2' in text and 'fail 1' in text
assert 'SyntaxError' not in text
result = run_parent(['js/src/web/app.min.js', 'js/src/web/app.css'], [
    'node', 'experiments/issue-56/friend-stats-native.mjs', '--before'],
    'ci-logs/friend-stats-before-ui.log')
assert result.returncode == 0
