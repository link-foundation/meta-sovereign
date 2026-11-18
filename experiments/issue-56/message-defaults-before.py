"""Probe published parent defaults and UI, restoring every byte afterward."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '8bb1595f2d80fb191eeeb5aaf8d6fae834b2592e'
paths = ['js/src/automation/vk-wall-settings.js', 'js/src/web/app.min.js']
current = {name: (root / name).read_bytes() for name in paths}
environment = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    target = root / 'ci-logs/message-defaults-before-node.log'
    with target.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
            '--test-name-pattern=ten original message defaults',
            'js/tests/vk-message-defaults.test.js'], cwd=root, env=environment,
            stdout=output, stderr=subprocess.STDOUT)
    text = target.read_text()
    assert result.returncode == 1 and '1 !== 10' in text
    assert 'SyntaxError' not in text
    with (root / 'ci-logs/message-defaults-before-ui.log').open('w') as output:
        subprocess.run(['node', 'experiments/issue-56/message-defaults-native.mjs', '--before'],
                       cwd=root, env=environment, stdout=output, stderr=subprocess.STDOUT,
                       check=True)
finally:
    for name, content in current.items():
        (root / name).write_bytes(content)
