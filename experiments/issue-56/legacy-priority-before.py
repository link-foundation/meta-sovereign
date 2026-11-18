"""Reproduce persisted-list failures with exact parent sources and finite fixtures."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '3e70de44b2f6fd5224ba49fab5ed3f7e28ab6ba0'
paths = [f'js/src/automation/vk-{name}-settings.js'
         for name in ('friends', 'maintenance', 'personal')]
current = {path: (root / path).read_bytes() for path in paths}
log = root / 'ci-logs/vk-legacy-priority-before.log'
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-reporter=tap', '--test-concurrency=1',
            'js/tests/vk-legacy-priorities.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    content = log.read_text()
    assert result.returncode == 1
    assert '# pass 2' in content and '# fail 3' in content
    assert 'normalizeVkFriendSettings' in content
    assert 'normalizeVkMaintenance' in content
    assert 'ERR_MODULE_NOT_FOUND' not in content and 'SyntaxError' not in content
    print('Verified three persisted-priority failures against exact parent sources')
finally:
    for path, content in current.items():
        (root / path).write_bytes(content)
