"""Reproduce the published backend collision with finite controller probes."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

files = [f'js/src/server/{name}.js' for name in ['runner-control', 'runner-session']]
with published_application_sources(__file__, '802c6168', files) as (root, env):
    log, result = run_parent_application_probe(root, env, 'runner-screen', [
        'node', '--test', '--test-concurrency=1', 'js/tests/runner-screen.test.js',
    ])
    text = log.read_text()
    assert result.returncode != 0
    assert 'tests 4' in text and 'fail 2' in text and 'pass 2' in text
    print(f'Published parent: two backend/identity failures and two compatible controls: {log}')
