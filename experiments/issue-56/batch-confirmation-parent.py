"""Reproduce one batch on the failed published source, restoring all bytes."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = '4363ddd95d2fb9b9c74ee0cdf0a785a30afc4bc3'
with published_application_sources(__file__, parent) as (root, env):
    env['MS_JOBS_APPLICATION_DEBUG'] = '1'
    path, result = run_parent_application_probe(root, env, 'batch-confirmation-parent', [
        'node', 'experiments/issue-56/batch-confirmation-webkit.mjs'], native=True)
    print(f'{path}: exit {result.returncode}', flush=True)
