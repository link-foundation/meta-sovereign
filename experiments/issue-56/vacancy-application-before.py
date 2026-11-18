"""Reproduce absent native application cache receipts on the published parent."""
from application_parent_fixture import published_application_sources, run_parent_application_probe

parent = '217682a5eed516feb640ac860b34bcbdbe6e065e'
paths = [
    'js/src/assignments/vacancy-history.js', 'js/src/assignments/vacancy-content.js',
    'js/src/assignments/vacancy.js', 'js/src/jobs/application-review.js',
    'js/src/jobs/application-service.js', 'js/src/web/vacancies-panel.js',
    *[f'js/src/web/locales/{locale}-vacancy.js' for locale in ['en', 'ru', 'hi', 'zh']],
]
with published_application_sources(__file__, parent, paths) as (root, env):
    log, result = run_parent_application_probe(root, env, 'vacancy-application', [
        'node', '--test', '--test-concurrency=1', '--test-timeout=10000',
        '--test-name-pattern=confirmed native delivery|refresh preserves|application metadata',
        'js/tests/vacancy-application.test.js',
    ])
    text = log.read_text()
    assert result.returncode != 0 and 'ERR_MODULE_NOT_FOUND' not in text
    assert "expected: 'applied'" in text
    print(f'Expected cache receipt failures at {parent}; exit {result.returncode}', flush=True)
    log, result = run_parent_application_probe(root, env, 'vacancy-application', [
        'node', 'experiments/issue-56/vacancy-application-browser.mjs', '--before',
    ], native=True)
    assert result.returncode == 0, log.read_text()
    assert '"applicationCache":false' in log.read_text()
    print('Native parent delivery succeeds but cached application evidence is absent; resources drained.')
