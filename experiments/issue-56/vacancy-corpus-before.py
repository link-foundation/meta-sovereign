"""Reproduce silent truncation of the actual published private cache readers."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = '51ff8bf0ac1cd703e722ad35602e6c0fc1924137'
paths = [
    'js/src/jobs/technology-service.js', 'js/src/jobs/technology-analysis.js',
    'js/src/jobs/technology-result.js', 'js/src/web/vacancy-api.js',
]
with published_application_sources(__file__, parent, paths) as (root, env):
    log, result = run_parent_application_probe(root, env, 'vacancy-corpus', [
        'node', '--test', '--test-concurrency=1', '--test-timeout=10000',
        'js/tests/vacancy-corpus.test.js',
    ])
    text = log.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert 'tests 8' in text and 'pass 1' in text and 'fail 7' in text, text
    print(f'Expected seven truncation failures and one budget control at {parent}; resources drained.')
