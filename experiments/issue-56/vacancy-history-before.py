"""Reproduce missing observation history against the actual local parent."""
from application_parent_fixture import published_application_sources
import subprocess

parent = 'b873b283'
paths = ['js/src/assignments/vacancy.js', 'js/src/assignments/vacancy-content.js']
with published_application_sources(__file__, parent, paths) as (root, env):
    log_path = root / 'ci-logs/vacancy-history-before.log'
    with log_path.open('w') as log:
        result = subprocess.run(['node', '--test', '--test-concurrency=1',
            '--test-timeout=10000', 'js/tests/vacancy-history.test.js'], cwd=root,
            env=env,
            stdout=log, stderr=subprocess.STDOUT)
    text = log_path.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert 'Expected values to be strictly deep-equal' in text
    print(f'Expected observation-history failures at {parent}; exit {result.returncode}')
