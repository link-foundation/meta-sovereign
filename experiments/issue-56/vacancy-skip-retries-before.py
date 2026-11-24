"""Replay the published refusal policy and always restore the working draft."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '9c369eaf45d8d33c2b095924d7f956defef2ee3c'
targets = subprocess.check_output(
    ['git', 'diff', '--name-only', '--', 'js/src'], cwd=root
).decode().splitlines()
originals = {name: (root / name).read_bytes() for name in targets}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384')
try:
    for name in targets:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    with (root / 'ci-logs/vacancy-skip-retries-before.log').open('w') as log:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1',
            'js/tests/job-vacancy-skip-retries.test.js',
        ], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'Published refusals unexpectedly support bounded retries'
    env['VACANCY_SKIP_RETRY_SCREENSHOTS'] = 'docs/screenshots/issue-56-vacancy-skip-retries'
    with (root / 'ci-logs/vacancy-skip-retries-before-native.log').open('w') as log:
        result = subprocess.run([
            'node', 'experiments/issue-56/vacancy-skip-retries-native.mjs', '--before',
        ], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    assert result.returncode != 0, 'Published native refusals unexpectedly record a disabled Send'
    print(f'Published {parent} refuses the new service and native regressions.')
finally:
    for name, content in originals.items():
        (root / name).write_bytes(content)
