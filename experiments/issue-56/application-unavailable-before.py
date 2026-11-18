"""Finite reproduction against the actual published unavailable-page reader."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

with published_application_sources(__file__, '13623bf7', [
    'js/src/jobs/application-options.js', 'js/src/jobs/application-result.js',
    'js/src/jobs/application-holds.js', 'js/src/jobs/vacancy-skip-data.js',
    'js/src/jobs/vacancy-skip-service.js',
]) as (root, env):
    log, result = run_parent_application_probe(root, env, 'application-unavailable', [
        'node', '--test', '--test-concurrency=1',
        'js/tests/job-application-unavailable.test.js',
    ])
    assert result.returncode != 0, 'Expected missing account-unavailable handling.'
    assert 'tests 4' in log.read_text() and 'fail 4' in log.read_text()
    print(f'Four published-parent failures reproduced: {log}')
