"""Reproduce the absent daily-limit backup against the published admission unit."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '74463a76') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    if native:
        command += ['experiments/issue-56/application-limit-drafts-native.mjs']
        env = dict(env, APPLICATION_LIMIT_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    else:
        command += ['--test', '--test-concurrency=1', '--test-name-pattern=a daily refusal automatically', 'js/tests/job-application-limit-drafts.test.js']
    path, result = run_parent_application_probe(root, env, 'application-limit-drafts', command, native)
    expected = 'Daily-limit recovery draft is missing.' if native else 'The visible daily-limit form needs an automatic recovery draft.'
    assert result.returncode != 0 and expected in path.read_text(), path.read_text()
    print('Published-parent missing backup reproduced; production sources restored and fixtures drained.')
