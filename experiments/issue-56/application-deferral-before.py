"""Reproduce the exact published missing deferral without leaving replaced sources."""
import sys
import subprocess
from application_parent_fixture import published_application_sources, serve_parent_application

with published_application_sources(__file__, '5e622049') as (root, env):
    if '--mcp' in sys.argv:
        serve_parent_application(root, env, 'application-deferral')
    else:
        native = '--native' in sys.argv
        command = ['node', '--max-old-space-size=384', 'experiments/issue-56/application-deferral-native.mjs'] if native else [
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=confirmed deferral acknowledges', 'js/tests/job-application-deferrals.test.js']
        log = root / ('ci-logs/application-deferral-before-native.log' if native else 'ci-logs/application-deferral-before.log')
        with log.open('wb') as out:
            result = subprocess.run(command, cwd=root, stdout=out, stderr=subprocess.STDOUT, env=env)
        assert result.returncode != 0
        assert ('404' if native else 'is not a function') in log.read_text()
        print('Exact published parent lacks backed deferral; all fixture resources drained')
