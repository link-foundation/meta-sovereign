"""Reproduce missing finite batch orchestration on the exact published parent."""
import sys
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, 'af668771') as (root, env):
    native = '--native' in sys.argv
    command = ['node', '--max-old-space-size=384']
    command += ['js/tests/e2e-job-application-batch-browser.mjs'] if native else [
        '--test', '--test-concurrency=1', '--test-name-pattern=finite batch follows',
        'js/tests/job-application-batch.test.js']
    env = dict(env, APPLICATION_BATCH_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    path, result = run_parent_application_probe(root, env, 'application-batch', command, native=native)
    expected = 'finite paced batch controls are absent' if native else 'paced batch orchestration is absent'
    assert result.returncode != 0 and expected in path.read_text()
print('Published-parent absence reproduced; actual sources/bundle restored and fixtures drained.')
