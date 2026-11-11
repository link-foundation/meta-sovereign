"""Actual preceding source regression, with restoration even after a failed probe."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'd4d04df2c3e6f3be9fc3bcc673430301747ef48e'
paths = subprocess.check_output(
    ['git', 'diff', '--name-only', '--', 'js/src'], cwd=root, text=True
).splitlines()
paths = [path for path in paths if path != 'js/src/web/app.min.js']
current = {path: (root / path).read_bytes() for path in paths}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1')


def run(log, args, check=True):
    with (root / 'ci-logs' / log).open('w') as output:
        return subprocess.run(args, cwd=root, env=env, stdout=output,
                              stderr=subprocess.STDOUT, check=check)


try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    result = run('pending-turn-before-node.log', [
        'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
        '--test-name-pattern=browser review and native|earlier pending edit|legacy latest-only|malformed, incomplete',
        'js/tests/browser-pending-turn.test.js'], check=False)
    if result.returncode != 1:
        raise RuntimeError(f'Expected parent assertion failure, got {result.returncode}')
    run('pending-turn-before-build.log', ['node', 'js/scripts/build-web.mjs'])
    run('pending-turn-before-ui.log', ['node', 'experiments/issue-56/pending-turn-ui.mjs', '--before'])
finally:
    for path, content in current.items():
        (root / path).write_bytes(content)
    run('pending-turn-restored-build.log', ['node', 'js/scripts/build-web.mjs'])
