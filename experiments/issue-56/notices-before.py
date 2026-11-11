"""Reproduce notice planning/UI on the actual parent, restoring sources finally."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
learning = '--learning' in sys.argv
prefix = 'notice-learning' if learning else 'notices'
parent = ('66a1949fb3e497060b68924f8be7559e6d3b0238' if learning else
          'e172fd11a6f8dea07b8528051374e498871b21ab')
paths = subprocess.check_output(
    ['git', 'diff', '--name-only', '--', 'js/src'], cwd=root, text=True
).splitlines()
paths = [path for path in paths if path != 'js/src/web/app.min.js']
current = {path: (root / path).read_bytes() for path in paths}
env = dict(os.environ, NODE_OPTIONS='--max-old-space-size=384', RUN_BROWSER_E2E='1',
           E2E_EXECUTABLE_PATH=os.environ.get('E2E_EXECUTABLE_PATH', '/opt/google/chrome/chrome'),
           NOTICE_SCREENSHOTS=str(root / 'docs/screenshots'))


def run(log, args, check=True):
    with (root / 'ci-logs' / log).open('w') as output:
        return subprocess.run(args, cwd=root, env=env, stdout=output,
                              stderr=subprocess.STDOUT, check=check)


try:
    for path in paths:
        (root / path).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{path}'], cwd=root))
    result = run(f'{prefix}-before-node.log', [
        'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
        '--test-name-pattern=' + ('actual notice replies learn' if learning else
                                'reviewed notice replies'),
        'js/tests/question-notice-learning.test.js' if learning else
        'js/tests/question-notices.test.js'], check=False)
    if result.returncode != 1:
        raise RuntimeError(f'Expected parent assertion failure, got {result.returncode}')
    run(f'{prefix}-before-build.log', ['node', 'js/scripts/build-web.mjs'])
    run(f'{prefix}-before-ui.log', [
        'node', 'experiments/issue-56/notices-ui.mjs', '--before',
        *(['--learning'] if learning else [])])
finally:
    for path, content in current.items():
        (root / path).write_bytes(content)
    run(f'{prefix}-restored-build.log', ['node', 'js/scripts/build-web.mjs'])
