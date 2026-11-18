"""Reproduce missing observation history against the actual local parent."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = 'b873b283'
paths = ['js/src/assignments/vacancy.js', 'js/src/assignments/vacancy-content.js']
saved = {name: (root / name).read_bytes() for name in paths}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    log_path = root / 'ci-logs/vacancy-history-before.log'
    with log_path.open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-timeout=10000', 'js/tests/vacancy-history.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=log, stderr=subprocess.STDOUT)
    text = log_path.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert 'Expected values to be strictly deep-equal' in text
    print(f'Expected observation-history failures at {parent}; exit {result.returncode}')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
