"""Serve the exact parent's 100-row UI with the same finite 101-row cache."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

paths = ['js/src/jobs/technology-service.js', 'js/src/jobs/technology-analysis.js',
         'js/src/jobs/technology-result.js', 'js/src/web/vacancy-api.js']
with published_application_sources(__file__, '51ff8bf0ac1cd703e722ad35602e6c0fc1924137', paths) as (root, env):
    log, result = run_parent_application_probe(root, env, 'vacancy-corpus', [
        'node', 'experiments/issue-56/vacancy-corpus-mcp-server.mjs',
    ], native=True)
    assert result.returncode == 0, log.read_text()
    print('Parent cache fixture closed; current sources and bundle restored.')
