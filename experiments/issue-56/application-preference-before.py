"""Reproduce response-only CV choices on the exact parent, restoring all sources."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '1e97b9fa') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-resume-native.mjs']
        env = dict(env, APPLICATION_PREFERENCE_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=an acknowledged manual CV choice survives', 'js/tests/job-application-resume-preference.test.js']
    path = root / f'ci-logs/application-preference-before{"-native" if native else ""}.log'
    with path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    expected = 'Saved resume preference is missing.' if native else 'undefined'
    assert result.returncode != 0 and expected in path.read_text(), path.read_text()
    print('Exact parent lacks durable CV-choice history; sources restored and fixtures drained.')
