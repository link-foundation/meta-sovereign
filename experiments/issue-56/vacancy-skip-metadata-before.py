"""Reproduce a known-later employer link lost by the published refusal ledger."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = 'c4ebc9de786e62e2dda08e74a9a853ed57c1882d'
with published_application_sources(__file__, parent, ['js/src/jobs/vacancy-skip-service.js']) as (root, env):
    log, result = run_parent_application_probe(root, env, 'vacancy-skip-metadata', [
        'node', '--test', '--test-concurrency=1',
        '--test-name-pattern=a later employer link', 'js/tests/job-vacancy-skips.test.js',
    ])
    text = log.read_text()
    assert result.returncode != 0 and 'fail 1' in text
    assert 'a later employer link updates the same refusal' in text
    assert 'ERR_MODULE_NOT_FOUND' not in text
    print(f'Expected same-attempt metadata failure on {parent}; source restored')
