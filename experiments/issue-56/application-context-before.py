"""Finite exact-parent service/native reproduction; production sources always restored."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '326acade') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-resume-native.mjs']
        env = dict(env, APPLICATION_CONTEXT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=context chooses from checked exports', 'js/tests/job-application-context.test.js']
    path = root / f'ci-logs/application-context-before{"-native" if native else ""}.log'
    with path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    content = path.read_text()
    assert result.returncode != 0 and ('jobs-application-input' in content if not native else 'Contextual resume choice is missing.' in content), content
    print('Published parent lacks contextual resume choice; sources restored and fixtures drained.')
