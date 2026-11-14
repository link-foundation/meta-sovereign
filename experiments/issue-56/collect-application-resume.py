"""Preserve explicit native choice evidence without claiming complete HH parity."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'application-resume')
for label, fragments in {
    'node-final': ('pass 20', 'fail 0'),
    'compatibility': ('pass 53', 'fail 0'),
    'deno-final': ('15 passed | 0 failed',),
    'i18n-final': ('pass 25', 'fail 0'),
    'before': ('is not a function',),
    'before-native': ('Native resume choice is missing.',),
    'native-final': ('"phase":"passed"', '"checkedHash":"english"',
                     '"exportLanguage":"ru"', '"sends":0', '"locales":4',
                     '"refusedUnsafeTargets":3', '"errors":[]',
                     '"browsersClosed":true', 'OK (chromium)'),
    'format-check-final': ('All matched files use Prettier code style!',),
}.items():
    for fragment in fragments:
        assert fragment in read(label), (label, fragment)
assert not any(read(label).strip() for label in ('lint-final', 'secrets-final', 'diff-final'))
assert 'ERROR:' not in read('duplication-final')
assert json.loads((root / '.jscpd.json').read_text())['threshold'] == 6.5
response = json.loads((logs / 'application-resume-mcp-final.json').read_text())
assert response.get('isError') is not True
report = '\n'.join(item.get('text', '') for item in response['content'])
assert all(fragment in report for fragment in (
    '"checkedHash":"english"', '"exportLanguage":"ru"', '"sends":0',
    '"ownerValuesPreserved":true', '"fourLocales":true',
    '"browsersClosed":true', '"errors":[]'))
assert all(fragment in read('mcp-server') for fragment in (
    '"opens":2', '"closed":true', '"providerClicks":0',
    '"pageErrors":[]', '"liveProvider":false'))
parent = '1e6582c3adfe84bd383c28f9a45e98776fa869a0'
helpers = [
    'experiments/issue-56/application_parent_fixture.py',
    'experiments/issue-56/application-mcp-fixture.mjs',
    'experiments/issue-56/compose-application-mcp.py',
    'experiments/issue-56/application-fixture.mjs',
    'experiments/issue-56/application-run-fixture.mjs',
    'experiments/issue-56/resume-language-fixture.mjs',
    'js/tests/helpers/application-panel-browser.mjs',
    'js/tests/helpers/application-native-request.mjs',
    'js/tests/helpers/application-controls.mjs',
    'js/tests/helpers/e2e-browser-scenarios.mjs',
    'ci-logs/application-popup-reference-resume.mjs',
]
bundle(root, [*changed_sources(root), *helpers,
              *evidence_logs(root, 'application-resume')],
       'docs/case-studies/issue-56/data/application-resume.tar.gz', {
           'parent': parent, 'node_focused': 20, 'node_compatibility': 53,
           'new_deno': 15, 'dictionary_checks': 25, 'native_chromium': 1,
           'independent_mcp': 1, 'refused_unsafe_native_targets': 3,
           'native_resume_choices': 1, 'application_sends': 0,
           'durable_format_changed': False, 'original_inventory_unchecked': 81,
           'issue_complete': False, 'authenticated_provider': False,
           'exact_head_ci_still_required': True,
           'unfinished': ['automatic context-based resume language policy',
                          'authenticated HH02/HH06 parity',
                          'all original unchecked acceptance criteria'],
       }, 'application-resume-*.png', before={name: parent for name in (
           'js/src/jobs/application-page.js', 'js/src/jobs/application-service.js',
           'js/src/cli/application-command.js', 'js/src/web/application-api.js',
           'js/src/web/application-panel.js', 'js/src/web/app.min.js')})
