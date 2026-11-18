"""Replay the bounded random-identity regression against the published planner."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
path = root / 'js/src/automation/vk-cancelled-planner.js'
current = path.read_bytes()
try:
    path.write_bytes(subprocess.check_output([
        'git', 'show', '07d3159e:js/src/automation/vk-cancelled-planner.js'], cwd=root))
    with (root / 'ci-logs/ci-vk-message-random-before.log').open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
            '--test-name-pattern=follow-up planner', 'js/tests/vk-message-random.test.js'],
            cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
finally:
    path.write_bytes(current)
