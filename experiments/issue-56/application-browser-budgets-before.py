"""Replay the complete parent registration layout, restoring every source."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
names = ['package.json', 'js/scripts/browser-checks.json',
         'js/tests/e2e-job-application-feedback-browser.mjs',
         'js/tests/e2e-job-application-visibility-browser.mjs',
         'js/tests/helpers/e2e-vacancy-skips.mjs']
saved = {name: (root / name).read_bytes() for name in names}
try:
    for name in names:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'f0785c1b:{name}'], cwd=root))
    result = subprocess.run(['node', '--max-old-space-size=384', '--test',
        '--test-concurrency=1', 'js/tests/ci-browser-shards.test.js'],
        cwd=root, env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    print(result.stdout, end='')
    assert result.returncode == 1
    assert 'pass 8' in result.stdout and 'fail 2' in result.stdout
    print('PASS: two parent registration failures, eight independent controls; sources restored.')
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
