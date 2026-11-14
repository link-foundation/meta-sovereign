"""Reproduce missing confirmed waiting against the published draft-preservation unit."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, 'cac7f7d3') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-limit-wait-native.mjs']
        env = dict(env, APPLICATION_LIMIT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=confirmed daily waiting backs later', 'js/tests/job-application-limit-wait.test.js']
    path, result = run_parent_application_probe(root, env, 'application-limit-wait', command, native)
    assert result.returncode != 0 and 'Confirmed daily-limit waiting is missing.' in path.read_text(), path.read_text()
    print('Published-parent missing wait reproduced; production sources restored and fixtures drained.')
