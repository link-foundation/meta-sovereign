"""Verify the published parent's missing cache migration using public surfaces."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
parent = '997b0dd2e1c7297a6ab4db17e7a4421aa1e38094'
paths = ['js/src/assignments/vacancy.js', 'js/src/jobs/technology-service.js',
         'js/src/jobs/service.js']
saved = {name: (root / name).read_bytes() for name in paths}
try:
    for name in paths:
        (root / name).write_bytes(subprocess.check_output(
            ['git', 'show', f'{parent}:{name}'], cwd=root))
    log_path = root / 'ci-logs/vacancy-legacy-before.log'
    with log_path.open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-timeout=10000', 'js/tests/vacancy-legacy.test.js'], cwd=root,
            env=dict(os.environ, NODE_OPTIONS='--max-old-space-size=384'),
            stdout=log, stderr=subprocess.STDOUT)
    text = log_path.read_text()
    assert result.returncode != 0
    assert 'ERR_MODULE_NOT_FOUND' not in text
    assert 'Expected values to be strictly equal' in text
    print(f'Expected missing-migration regressions at {parent}; exit {result.returncode}')
finally:
    for name, content in saved.items():
        (root / name).write_bytes(content)
