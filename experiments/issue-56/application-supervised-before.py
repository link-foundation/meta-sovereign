"""Bounded exact-parent reproduction; restore all actual sources on exit."""
import subprocess
import sys
from application_parent_fixture import published_application_sources, serve_parent_application

with published_application_sources(__file__, 'f523ccc5') as (root, env):
    if '--mcp' in sys.argv:
        serve_parent_application(root, env, 'application-supervised')
        sys.exit(0)
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-supervised-native.mjs']
        env = dict(env, SUPERVISED_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=supervised answer and letter steps', 'js/tests/job-application-supervised.test.js']
    log = root / f'ci-logs/application-supervised-before{"-native" if native else ""}.log'
    with log.open('wb') as stream:
        result = subprocess.run(command, cwd=root, env=env, stdout=stream, stderr=subprocess.STDOUT)
    content = log.read_text()
    assert result.returncode != 0 and 'provider-confirmed' in content and 'none' in content
    print('Published parent combines letter, answers and delivery; actual sources restored and fixture drained')
