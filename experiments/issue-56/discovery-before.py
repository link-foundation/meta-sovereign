"""Reproduce absent automatic discovery on the exact published parent."""
from application_parent_fixture import published_application_sources, run_parent_application_probe
import sys
native = '--native' in sys.argv
with published_application_sources(__file__, '7998d2c5') as (root, env):
    env.update(NODE_OPTIONS='--max-old-space-size=384', DISCOVERY_BEFORE='1', APPLICATION_SCREENSHOTS='docs/screenshots')
    command = ['node', 'experiments/issue-56/discovery-browser.mjs'] if native else [
        'node', '--test', '--test-concurrency=1', 'js/tests/job-vacancy-discovery.test.js']
    path, result = run_parent_application_probe(root, env, 'vacancy-discovery', command, native=native)
    assert result.returncode != 0
    assert ('Finite automatic discovery must be available' if native else "is not a function") in path.read_text()
print('Exact published-parent discovery absence reproduced; source and bundle restored.')
