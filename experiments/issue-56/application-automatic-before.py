"""Bounded exact-parent automatic-policy regression; restore source bytes in finally."""
import sys
import subprocess
from application_parent_fixture import published_application_sources, serve_parent_application

with published_application_sources(__file__, '24ef1b88') as (root, env):
    if '--mcp' in sys.argv:
        serve_parent_application(root, env, 'application-automatic')
    else:
        native = '--native' in sys.argv
        command = ['node', '--max-old-space-size=384', 'experiments/issue-56/application-automatic-native.mjs'] if native else [
            'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
            '--test-name-pattern=enabling questionnaire deferral automatically', 'js/tests/job-application-automatic-deferral.test.js']
        log = root / ('ci-logs/application-automatic-before-native.log' if native else 'ci-logs/application-automatic-before.log')
        with log.open('wb') as out:
            result = subprocess.run(command, cwd=root, stdout=out, stderr=subprocess.STDOUT, env=env)
        assert result.returncode != 0
        assert 'closed' in log.read_text() and 'deferred' in log.read_text()
        print('Exact parent keeps the questionnaire open; all fixture resources drained')
