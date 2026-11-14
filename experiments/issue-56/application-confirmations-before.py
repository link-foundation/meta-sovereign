"""Reproduce missing per-step continuation on the exact published parent."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '6ad826b0') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    command += ['js/tests/e2e-job-application-confirmations-browser.mjs'] if native else [
        '--test', '--test-concurrency=1', '--test-name-pattern=default questionnaire',
        'js/tests/job-application-confirmations.test.js']
    env = dict(env, APPLICATION_CONFIRMATIONS_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    path, result = run_parent_application_probe(root, env, 'application-confirmations', command, native=native)
    expected = 'independent confirmation control is absent' if native else 'independent continuation is absent'
    assert result.returncode != 0 and expected in path.read_text()
print('Published-parent absence reproduced; actual sources/bundle restored and fixtures drained.')
