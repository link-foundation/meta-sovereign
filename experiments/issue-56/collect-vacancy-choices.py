"""Preserve finite actual-parent and shared owner-choice verification evidence."""
import json
from evidence_bundle import bundle, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'vacancy-choices')
assert 'pass 32' in read('unit') and 'fail 0' in read('unit')
assert 'service.choice-save is not a function' in read('before-node')
assert 'Saved owner vacancy choices must be available' in read('before-ui')
assert '[e2e-vacancy-choices] OK (webkit)' in read('browser-final')
assert '"providerClicks":0,"pageErrors":[]' in read('browser-final')
assert 'lostReplyRecovered' in read('mcp')
stats = json.loads((logs / 'vacancy-choices-mcp-stats.json').read_text())
assert stats == dict(opens=1, closed=True, providerClicks=0, pageErrors=[], liveProvider=False)
for check in ['lint', 'secretlint', 'diff']:
    assert not read(check).strip(), check
assert 'All matched files use Prettier code style!' in read('prettier')
assert 'ERROR' not in read('duplication')
sources = [
    '.changeset/visible-browser-defaults.md', 'package.json',
    'docs/REQUIREMENTS.md', 'docs/case-studies/issue-56/PLAN.md',
    'docs/case-studies/issue-56/README.md',
    'docs/case-studies/issue-56/reference-feature-inventory.md',
    'docs/case-studies/issue-56/vacancy-choices.md',
    'experiments/issue-56/collect-vacancy-choices.py',
    'experiments/issue-56/vacancy-choices-before.py',
    'experiments/issue-56/vacancy-choices-browser.mjs',
    'experiments/issue-56/vacancy-choices-mcp.mjs',
    'experiments/issue-56/vacancy-browser-fixture.mjs',
    'js/scripts/browser-checks.json', 'js/src/cli/vacancy-commands.js',
    'js/src/jobs/acknowledged-store.js', 'js/src/jobs/service.js',
    'js/src/jobs/technology-service.js', 'js/src/jobs/technology-storage.js',
    'js/src/jobs/vacancy-choice.js', 'js/src/jobs/vacancy-choice-service.js',
    'js/src/server/routes-vacancies.js',
    'js/src/web/vacancy-api.js', 'js/src/web/vacancy-choice-api.js',
    'js/src/web/vacancy-choice-state.js', 'js/src/web/vacancy-choices.js',
    'js/src/web/vacancies-panel.js',
    'js/tests/job-vacancy-choices.test.js', 'js/tests/vacancy-search.test.js',
    'js/tests/e2e-vacancy-choices-browser.mjs',
    'js/tests/helpers/e2e-vacancy-choices.mjs',
    *[f'js/src/web/locales/{locale}-vacancy.js' for locale in ['en', 'ru', 'zh', 'hi']],
]
bundle(root, [*sources, *evidence_logs(root, 'vacancy-choices', ('.log', '.json', '.png'))],
       'docs/case-studies/issue-56/data/vacancy-choices.tar.gz',
       dict(parent='64a9b6e2dc0bf32cbba03b21922fae3d1567e39b', focused=32,
            native_scenarios=3, mcp=stats, authenticated_provider=False,
            issue_complete=False, application_executor=False,
            unfinished=['HH05 automatic policies', 'HH06', 'HH07', 'HH08',
                        'Every unchecked original inventory criterion']),
       'issue-56-vacancy-choices/**/*.png',
       before={name: '64a9b6e2' for name in [
           'js/src/jobs/service.js', 'js/src/server/routes-vacancies.js',
           'js/src/web/vacancies-panel.js', 'js/src/cli/vacancy-commands.js']})
