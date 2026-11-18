"""Reproduce missing direct full-form review on the exact published parent."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '6899b33b') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-resume-native.mjs']
        env = dict(env, APPLICATION_FULLFORM_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=confirmed full-form navigation reaches', 'js/tests/job-application-fullform.test.js']
    path = root / f'ci-logs/application-fullform-before{"-native" if native else ""}.log'
    with path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    expected = 'Full-form review control is missing.' if native else 'jobs-application-confirmation'
    assert result.returncode != 0 and expected in path.read_text(), path.read_text()
    print('Exact parent lacks direct full-form review; sources restored and fixtures drained.')
