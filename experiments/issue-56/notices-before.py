"""Reproduce notice planning/UI on the actual parent, restoring sources finally."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'e172fd11a6f8dea07b8528051374e498871b21ab'
paths = subprocess.check_output(
    ['git', 'diff', '--name-only', '--', 'js/src'], cwd=root, text=True
).splitlines()
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
    result = run('notices-before-node.log', [
        'node', '--test', '--test-concurrency=1', '--test-timeout=20000',
        '--test-name-pattern=reviewed notice replies',
        'js/tests/question-notices.test.js'], check=False)
    if result.returncode != 1:
        raise RuntimeError(f'Expected parent assertion failure, got {result.returncode}')
    run('notices-before-build.log', ['node', 'js/scripts/build-web.mjs'])
    run('notices-before-ui.log', [
        'node', 'experiments/issue-56/notices-ui.mjs', '--before'])
finally:
    for path, content in current.items():
        (root / path).write_bytes(content)
    run('notices-restored-build.log', ['node', 'js/scripts/build-web.mjs'])
