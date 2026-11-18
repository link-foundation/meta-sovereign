"""The focused CI routing regression fails against the actual parent registry."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'fb6fc9d2'
files = ['package.json', 'js/scripts/browser-checks.json',
         'js/tests/e2e-questions-browser.mjs']
saved = {name: (root / name).read_bytes() for name in files}
try:
    for name in files:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    log = root / 'ci-logs/question-groups-before.log'
    with log.open('wb') as output:
        result = subprocess.run([
            'node', '--test', '--test-concurrency=1', '--test-timeout=30000',
            '--test-name-pattern=question provider and control scenarios',
            'js/tests/ci-contracts.test.js',
        ], cwd=root, env={**os.environ, 'NODE_OPTIONS': '--max-old-space-size=384'},
            stdout=output, stderr=subprocess.STDOUT, check=False)
    assert result.returncode != 0
    data = log.read_text()
    assert 'question-providers' in data and 'fail 1' in data
    print(f'Actual-parent routing regression preserved: {log}')
finally:
    for name, data in saved.items():
        (root / name).write_bytes(data)
