"""Reproduce actual automatic dispatch after dismissal on the exact published parent."""
import subprocess
import sys
from application_parent_fixture import published_application_sources, serve_parent_application

with published_application_sources(__file__, 'c4a40d2c') as (root, env):
    if '--mcp' in sys.argv:
        serve_parent_application(root, env, 'application-holds', {'APPLICATION_HOLD_FIXTURE': '1'})
        sys.exit(0)
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384', 'experiments/issue-56/application-holds-native.mjs'] if native else [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=dismissing a verification banner', 'js/tests/job-application-holds.test.js']
    log = root / f'ci-logs/application-holds-before{"-native" if native else ""}.log'
    with log.open('wb') as out:
        result = subprocess.run(command, cwd=root, stdout=out, stderr=subprocess.STDOUT, env=env)
    assert result.returncode != 0
    assert '1 !== 0' in log.read_text()
    print('Exact parent dispatches after dismissal; fixture drained and source bytes restored')
