"""Expose the Windows fixture's cleanup order on any local platform."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = 'c4ebc9de786e62e2dda08e74a9a853ed57c1882d'
source = 'experiments/issue-56/vacancy-legacy-fixture.mjs'
with published_application_sources(__file__, parent, [source]) as (root, env):
    log, result = run_parent_application_probe(root, env, 'legacy-cleanup', [
        'node', '--test', '--test-concurrency=1', 'js/tests/vacancy-legacy-lifecycle.test.js',
    ])
    assert result.returncode != 0 and 'fail 2' in log.read_text()
    assert 'Leave the fixture before Windows removes its locked directory' in log.read_text()
    print(f'Expected two cleanup-order failures on {parent}; fixture restored')
