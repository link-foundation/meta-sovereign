"""Verify the published parent lacks the policy; restore all sources and bundle."""
from application_parent_fixture import published_application_sources, run_parent_application_probe
import sys
native = '--service' not in sys.argv
with published_application_sources(__file__, '8007a002') as (root, env):
    env.update(NODE_OPTIONS='--max-old-space-size=384', APPLICATION_FEEDBACK_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    log, result = run_parent_application_probe(root, env, 'application-feedback',
        ['node', 'experiments/issue-56/application-feedback-browser.mjs'] if native else
        ['node', '--test', '--test-concurrency=1', 'js/tests/job-application-feedback.test.js', 'js/tests/job-application-feedback-controls.test.js'], native=native)
    assert result.returncode != 0
    assert ('Viewed-vacancy survey policy must be configurable' if native else 'AssertionError') in log.read_text()
print('Published-parent missing native feedback policy reproduced; sources restored.')
