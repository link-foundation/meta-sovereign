"""Bound the regression on the exact published parent, restoring every byte."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = '4363ddd95d2fb9b9c74ee0cdf0a785a30afc4bc3'
with published_application_sources(__file__, parent) as (root, env):
    path, result = run_parent_application_probe(root, env, 'deferred-questions', [
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=explicit unanswered-question|a newly saved fragment',
        'js/tests/job-deferred-questions.test.js'])
    assert result.returncode == 1, path
    path, result = run_parent_application_probe(root, env, 'deferred-questions', [
        'node', 'experiments/issue-56/deferred-questions-browser.mjs'], native=True)
    assert result.returncode == 1, path
