"""Reproduce the missing backed generic retry against the published hold unit."""
import subprocess
import sys
from application_parent_fixture import published_application_sources, serve_parent_application

with published_application_sources(__file__, '37d0a3c9') as (root, env):
    if '--mcp' in sys.argv:
        serve_parent_application(root, env, 'application-retries', {'APPLICATION_RETRY_FIXTURE': '1'})
        sys.exit(0)
    native = '--native' in sys.argv
    target = 'experiments/issue-56/application-retries-native.mjs'
    command = ['node', '--max-old-space-size=384', target] if native else [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        '--test-name-pattern=generic-error full forms are backed',
        'js/tests/job-application-retries.test.js']
    log = root / f'ci-logs/application-retries-before{"-native" if native else ""}.log'
    with log.open('wb') as stream:
        result = subprocess.run(command, cwd=root, env=env, stdout=stream, stderr=subprocess.STDOUT)
    content = log.read_text()
    assert result.returncode != 0 and 'provider-error' in content and 'closed' in content
    print('Published parent retains generic-error form without the backed retry queue; sources restored and fixture drained')
