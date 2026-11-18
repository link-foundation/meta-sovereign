"""Reproduce discarded native URL filters against the actual parent sources."""
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
parent = '406e8bdf'
native = '--native' in sys.argv
paths = ['js/src/web/app.min.js'] if native else [
    'js/src/jobs/options.js', 'js/src/jobs/discovery-data.js',
    'js/src/jobs/search-result.js',
]
saved = {name: (root / name).read_bytes() for name in paths}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    log_path = root / f'ci-logs/vacancy-search-url-before{"-native" if native else ""}.log'
    command = ['node', 'experiments/issue-56/vacancy-search-url-native.mjs', '--before'] if native else [
        'node', '--test', '--test-concurrency=1', 'js/tests/vacancy-search-url.test.js']
    with log_path.open('w') as log:
        result = subprocess.run(command, cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=log, stderr=subprocess.STDOUT)
    text = log_path.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert ('Owner search URL control must exist' if native else 'fail 5') in text
    if not native:
        assert 'pass 1' in text
    print(f'Expected parent URL failures at {parent}; exit {result.returncode}; native={native}')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
