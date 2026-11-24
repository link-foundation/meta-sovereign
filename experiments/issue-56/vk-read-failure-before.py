"""Reproduce invented local settings after a real connected server refusal."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['js/src/web/vk-provider-api.js', 'js/src/web/app.min.js']
current = {name: (root / name).read_bytes() for name in names}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'bb9d8f23:{name}'], cwd=root))
    target = root / 'ci-logs/vk-read-failure-before.log'
    with target.open('w') as output:
        result = subprocess.run([
            'node', '--test', '--test-reporter=tap', '--test-concurrency=1',
            '--test-name-pattern=production VK bridge',
            'js/tests/vk-read-failure.test.js'], cwd=root, env=env,
            stdout=output, stderr=subprocess.STDOUT)
    assert result.returncode == 1 and '# fail 1' in target.read_text()
    assert 'true !== false' in target.read_text()
    with (root / 'ci-logs/vk-read-failure-before-ui.log').open('w') as output:
        subprocess.run(['node', 'experiments/issue-56/vk-read-failure-native.mjs', '--before'],
                       cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, check=True)
    print('Verified real server refusal becomes local success on bb9d8f23')
finally:
    for name, content in current.items():
        (root / name).write_bytes(content)
