"""Reproduce both original search callers and canonical-path migration refusal."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = 'e2acf88a7bdee8ba4df94015036b612463e7ebed'
paths = [
    'js/src/assignments/vacancy-legacy-cache.js',
    'js/tests/jobs-browser-session.test.js',
    'js/tests/jobs-manual-login.test.js',
]
with published_application_sources(__file__, parent, paths) as (root, env):
    log, result = run_parent_application_probe(root, env, 'runtime-cache-paths', [
        'node', '--test', '--test-concurrency=1',
        'js/tests/vacancy-legacy-paths.test.js',
        'js/tests/jobs-browser-session.test.js',
        'js/tests/jobs-manual-login.test.js',
    ])
    text = log.read_text()
    assert result.returncode != 0 and 'fail 3' in text
    assert 'A valid aliased source must migrate' in text
    assert 'Use a valid HH vacancy search URL.' in text
    print(f'Expected three failures on {parent}; original files restored')
