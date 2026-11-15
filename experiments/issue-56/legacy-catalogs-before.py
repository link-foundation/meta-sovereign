"""Reproduce real saved-list read and reviewed-delivery failures on the parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = [f'js/src/automation/vk-{name}-settings.js' for name in (
    'friends', 'personal', 'wall', 'birthday', 'reengage', 'retention')]
names.append('js/src/web/app.min.js')
current = {name: (root / name).read_bytes() for name in names}
log = root / 'ci-logs/vk-legacy-catalogs-before.log'
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'3a24c7a5:{name}'], cwd=root))
    with log.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-reporter=tap', '--test-concurrency=1',
            '--test-name-pattern=persisted VK catalogs|actual reviewed birthday',
            'js/tests/vk-legacy-catalogs.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=output, stderr=subprocess.STDOUT)
    content = log.read_text()
    assert result.returncode == 1 and '# fail 2' in content
    assert 'communities must be text' in content and 'messages must be text' in content
    assert 'ERR_MODULE_NOT_FOUND' not in content and 'SyntaxError' not in content
    with (root / 'ci-logs/vk-legacy-catalogs-before-ui.log').open('w') as output:
        subprocess.run(['node', 'experiments/issue-56/legacy-catalogs-native.mjs', '--before'],
                       cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
                       stdout=output, stderr=subprocess.STDOUT, check=True)
    print('Verified persisted destination/catalog and actual birthday review failures on 3a24c7a5')
finally:
    for name, content in current.items():
        (root / name).write_bytes(content)
