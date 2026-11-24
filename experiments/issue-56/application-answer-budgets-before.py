"""Check the actual prior grouping, leaving scenarios and browser fixtures untouched."""
from pathlib import Path
import os
import subprocess

root = Path(__file__).resolve().parents[2]
files = ['package.json', 'js/scripts/browser-checks.json',
         'js/tests/e2e-job-application-answers-browser.mjs']
saved = {name: (root / name).read_bytes() for name in files}
try:
    for name in files:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'5525aaa0:{name}'], cwd=root))
    outcome = subprocess.run(['node', '--test', '--test-concurrency=1',
        'js/tests/ci-browser-shards.test.js'], cwd=root,
        env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
        capture_output=True, text=True)
    print(outcome.stdout, end='')
    print(outcome.stderr, end='')
    assert outcome.returncode == 1 and 'fail 1' in outcome.stdout
    print('The actual parent fails the independent salary budget contract; sources restored.')
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
