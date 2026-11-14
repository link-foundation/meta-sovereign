"""Bounded exact-parent regression, restoring all production sources afterward."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '8ab11c52') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-limits-native.mjs']
        env = dict(env, APPLICATION_LIMIT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=visible daily refusal keeps', 'js/tests/job-application-limit.test.js']
    log_path, result = run_parent_application_probe(root, env, 'application-limits', command, native)
    expected = 'Durable daily application pause is missing.' if native else 'actual: undefined'
    assert result.returncode != 0 and expected in log_path.read_text(), log_path.read_text()
    print('Exact parent regression reproduced; production sources restored and fixtures drained.')
