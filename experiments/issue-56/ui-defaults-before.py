"""Reproduce missing shared presentation defaults on the actual published parent."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '10a9f1e1') as (root, env):
    log, result = run_parent_application_probe(root, env, 'ui-defaults', [
        'node', '--test', '--test-concurrency=1', 'js/tests/ui-defaults.test.js',
    ])
    assert result.returncode != 0
    assert 'fail 5' in log.read_text(), log.read_text()
    log, result = run_parent_application_probe(root, env, 'ui-defaults', [
        'node', 'experiments/issue-56/ui-defaults-native.mjs', '--before',
    ], native=True)
    assert result.returncode != 0
    assert '0 !== 1' in log.read_text(), log.read_text()
    print('Five focused failures and the missing native reset reproduce on 10a9f1e1.')
