"""Finite published-parent regression; restore every selected source on exit."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

FILES = [f'js/src/{name}' for name in [
    'cli/runner-profile.js', 'cli/runner-configuration.js',
    'server/runner-control.js', 'server/runner-session.js',
    'server/runner-transport.js', 'server/runner-inspection.js',
]]
with published_application_sources(__file__, '47c2b808', FILES) as (root, env):
    log, result = run_parent_application_probe(root, env, 'runner-docker', [
        'node', '--test', '--test-concurrency=1', 'experiments/issue-56/runner-docker-profile.mjs',
    ])
    assert result.returncode != 0, 'Expected the published Screen-only parent to refuse Docker.'
    assert 'Runner profile unavailable or invalid.' in log.read_text()
    print(f'Published-parent refusal reproduced: {log}')
