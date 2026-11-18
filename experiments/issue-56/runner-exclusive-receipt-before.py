"""Bounded reproduction of stale mutual-exclusion acknowledgements."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '43e91c4f', [
    'js/src/server/runner-control.js',
]) as (root, env):
    log, result = run_parent_application_probe(root, env, 'runner-exclusive-receipt', [
        'node', '--test', '--test-concurrency=1',
        'js/tests/runner-exclusive-receipt.test.js',
    ])
    assert result.returncode != 0, 'Expected stale exclusion receipts on the published controller.'
    assert 'tests 6' in log.read_text() and 'fail 6' in log.read_text()
    print(f'Six published-parent receipt failures reproduced: {log}')
