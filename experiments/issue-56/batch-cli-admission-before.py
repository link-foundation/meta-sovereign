"""Reproduce missing batch admission on the exact published CLI entrypoint."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '281d6dcc') as (root, env):
    path, result = run_parent_application_probe(root, env, 'batch-cli-admission', [
        'node', '--max-old-space-size=384', '--test', '--test-concurrency=1',
        'js/tests/cli-help-imports.test.js', 'js/tests/cli-batch-admission.test.js'])
    text = path.read_text()
    assert result.returncode != 0
    assert all(fragment in text for fragment in [
        'Missing expected rejection', 'lightweight admission retains', 'fail 2'])
print('Both published-parent admission failures reproduced; actual sources restored.')
