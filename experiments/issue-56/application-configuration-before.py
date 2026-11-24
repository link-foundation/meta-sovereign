"""Reproduce the ignored saved survey opt-out on the exact published parent."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '21b7afcb') as (root, env):
    env['NODE_OPTIONS'] = '--max-old-space-size=384'
    log, result = run_parent_application_probe(root, env, 'application-configuration', [
        'node', '--test', '--test-concurrency=1',
        'js/tests/job-application-configuration.test.js'])
    assert result.returncode != 0
    assert 'fail 2' in log.read_text() and 'pass 2' in log.read_text()
print('Published parent ignores saved single/batch policy; all sources restored.')
