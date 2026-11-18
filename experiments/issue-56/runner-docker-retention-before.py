"""Reproduce the real automatic-cleanup mismatch against the published launch."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '13788383', [
    'js/src/server/runner-docker.js',
]) as (root, env):
    log, result = run_parent_application_probe(root, env, 'runner-docker-retention', [
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=remote Docker starts', 'js/tests/runner-docker.test.js',
    ])
    assert result.returncode != 0, 'Expected the published launch to lose the exited container.'
    assert 'tests 1' in log.read_text() and 'fail 1' in log.read_text()
    print(f'Published-parent lifecycle failure reproduced: {log}')
