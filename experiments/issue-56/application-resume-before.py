"""Bounded exact-parent reproduction; always restores working production sources."""
import subprocess
import sys
from application_parent_fixture import published_application_sources

with published_application_sources(__file__, '1e6582c3') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-resume-native.mjs']
        env = dict(env, APPLICATION_RESUME_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=explicit native resume choice', 'js/tests/job-application-resume.test.js']
    path = root / f'ci-logs/application-resume-before{"-native" if native else ""}.log'
    with path.open('wb') as log:
        result = subprocess.run(command, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    content = path.read_text()
    assert result.returncode != 0 and ('is not a function' in content if not native else 'Native resume choice is missing.' in content), content
    print('Published parent has no native resume choice; sources restored and fixtures drained.')
