"""Run only the finite consent regression against the committed parent code."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'fe44affd'
names = [
    'vk-greet-planner', 'vk-reengage-planner', 'vk-cancelled-planner',
    'vk-personal-policy', 'vk-discovery-planner', 'vk-discovery-guards',
    'vk-retention-planner', 'vk-retention-guards', 'vk-personal-job',
    'vk-reengage-payload', 'vk-friends-planner', 'vk-friends-executor',
    'vk-maintenance',
]
paths = [Path('js/src/automation') / f'{name}.js' for name in names]
saved = {path: (root / path).read_bytes() for path in paths}
try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    with (root / 'ci-logs/vk-person-consent-before.log').open('wb') as log:
        result = subprocess.run([
            'node', '--max-old-space-size=256', '--test', '--test-concurrency=1',
            'js/tests/vk-person-consent.test.js',
        ], cwd=root, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode == 1, result.returncode
finally:
    for path, data in saved.items():
        (root / path).write_bytes(data)
