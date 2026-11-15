"""Run the new foreground priority workflow against the actual published parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '54c952479634ce8a589b2a19c2e4a83f991d0387'
paths = ['js/src/cli/vk-friends-commands.js', 'js/src/web/app.min.js']
current = {path: (root / path).read_bytes() for path in paths}
environment = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    log = root / 'ci-logs/friend-priority-before-node.log'
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
            '--test-name-pattern=CLI owns seed/clear stores',
            'js/tests/vk-friend-priority.test.js'], cwd=root, env=environment,
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1 and 'status|save|plan|run required' in log.read_text()
    assert 'SyntaxError' not in log.read_text()
    with (root / 'ci-logs/friend-priority-before-ui.log').open('w') as output:
        subprocess.run(['node', 'experiments/issue-56/friend-priority-native.mjs',
                        '--before'], cwd=root, env=environment,
                       stdout=output, stderr=subprocess.STDOUT, check=True)
finally:
    for path, content in current.items():
        (root / path).write_bytes(content)
